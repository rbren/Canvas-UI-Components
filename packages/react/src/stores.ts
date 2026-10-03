import type { AgentServices } from "@openhands/canvas-core";
import type { ConversationInfo } from "@openhands/typescript-client";
import type {
  AgentServerSettingsResponse,
  AgentServerSettingsPatchRequest,
  CreateConversationPayload,
} from "@openhands/typescript-client/clients";

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

class Store<T> {
  private listeners = new Set<() => void>();
  private initial: T;
  constructor(protected snapshot: T) {
    this.initial = snapshot;
  }
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  protected update(patch: Partial<T>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export interface SettingsSnapshot {
  settings: AgentServerSettingsResponse | null;
  loading: boolean;
  saving: boolean;
  error: Error | null;
}

export class SettingsStore extends Store<SettingsSnapshot> {
  private revision = 0;
  private request?: Promise<void>;
  constructor(private services: AgentServices) {
    super({ settings: null, loading: false, saving: false, error: null });
  }
  ensure = () => (this.snapshot.settings ? Promise.resolve() : this.refresh());
  refresh = (): Promise<void> => {
    if (this.snapshot.saving) return Promise.resolve();
    if (this.request) return this.request;
    const revision = ++this.revision;
    this.update({ loading: true, error: null });
    const request = this.services.settings
      .getSettings()
      .then(
        (settings) => {
          if (revision === this.revision)
            this.update({ settings, loading: false });
        },
        (cause: unknown) => {
          if (revision === this.revision)
            this.update({ error: asError(cause), loading: false });
          throw cause;
        },
      )
      .finally(() => {
        if (this.request === request) this.request = undefined;
      });
    this.request = request;
    return request;
  };
  save = async (patch: AgentServerSettingsPatchRequest): Promise<void> => {
    if (this.snapshot.saving)
      throw new Error("Settings are already being saved");
    ++this.revision;
    this.request = undefined;
    this.update({ saving: true, loading: false, error: null });
    try {
      const settings = await this.services.settings.updateSettings(patch);
      this.update({ settings, saving: false });
    } catch (cause) {
      this.update({ error: asError(cause), saving: false });
      throw cause;
    }
  };
}

export interface ConversationsSnapshot {
  conversations: readonly ConversationInfo[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
}

export class ConversationsStore extends Store<ConversationsSnapshot> {
  private revision = 0;
  private request?: Promise<void>;
  private nextPage?: string;
  private loaded = false;
  constructor(private services: AgentServices) {
    super({ conversations: [], loading: false, error: null, hasMore: false });
  }
  ensure = () => (this.loaded ? Promise.resolve() : this.refresh());
  refresh = (): Promise<void> => {
    if (this.request) return this.request;
    return this.fetchPage(false);
  };
  loadMore = (): Promise<void> => {
    if (this.request) return this.request;
    if (!this.nextPage) return Promise.resolve();
    return this.fetchPage(true);
  };
  private fetchPage(append: boolean): Promise<void> {
    const revision = ++this.revision;
    const cursor = append ? this.nextPage : undefined;
    this.update({ loading: true, error: null });
    const request = this.services.conversations
      .searchConversations({
        limit: 30,
        ...(cursor ? { page_id: cursor } : {}),
      })
      .then(
        (page) => {
          if (revision !== this.revision) return;
          const entries = new Map(
            (append ? this.snapshot.conversations : []).map((item) => [
              item.id,
              item,
            ]),
          );
          page.items.forEach((item) => entries.set(item.id, item));
          this.nextPage =
            page.next_page_id && page.next_page_id !== cursor
              ? page.next_page_id
              : undefined;
          this.loaded = true;
          this.update({
            conversations: [...entries.values()],
            loading: false,
            hasMore: !!this.nextPage,
          });
        },
        (cause: unknown) => {
          if (revision === this.revision)
            this.update({ loading: false, error: asError(cause) });
          throw cause;
        },
      )
      .finally(() => {
        if (this.request === request) this.request = undefined;
      });
    this.request = request;
    return request;
  }
  private invalidateRequests() {
    ++this.revision;
    this.request = undefined;
    this.nextPage = undefined;
    this.loaded = false;
  }
  create = async (
    payload: CreateConversationPayload,
  ): Promise<ConversationInfo> => {
    try {
      const conversation =
        await this.services.conversations.createConversation(payload);
      this.invalidateRequests();
      this.update({
        conversations: [
          conversation,
          ...this.snapshot.conversations.filter(
            (item) => item.id !== conversation.id,
          ),
        ],
        loading: false,
        error: null,
        hasMore: false,
      });
      // A catalog refresh failure must not turn a successful creation into a retryable create.
      void this.refresh().catch(() => {});
      return conversation;
    } catch (cause) {
      this.update({ error: asError(cause) });
      throw cause;
    }
  };
  remove = async (id: string): Promise<void> => {
    try {
      await this.services.conversations.deleteConversation(id);
      this.invalidateRequests();
      this.update({
        conversations: this.snapshot.conversations.filter(
          (item) => item.id !== id,
        ),
        loading: false,
        error: null,
        hasMore: false,
      });
      void this.refresh().catch(() => {});
    } catch (cause) {
      this.update({ error: asError(cause) });
      throw cause;
    }
  };
}
