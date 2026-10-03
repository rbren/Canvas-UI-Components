import {
  buildConversationEventStreamUrl,
  ConversationEventStream,
} from "@openhands/typescript-client/clients";
import type { ConversationClient } from "@openhands/typescript-client/clients";
import type { ConversationInfo, Message } from "@openhands/typescript-client";
import { asRecord, projectEvents } from "./projection";
import type { ConversationEvent } from "./events";
import type {
  AgentServicesOptions,
  ConversationSession,
  ConversationSnapshot,
} from "./types";

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function mergeEvents(
  ...groups: readonly (readonly ConversationEvent[])[]
): ConversationEvent[] {
  const result: ConversationEvent[] = [];
  const positions = new Map<string, number>();
  for (const events of groups) {
    for (const event of events) {
      const position = event.id ? positions.get(event.id) : undefined;
      if (position !== undefined) {
        if (
          event.kind !== "StreamingDeltaEvent" ||
          result[position].kind === "StreamingDeltaEvent"
        ) {
          result[position] = event;
        }
      } else {
        if (event.id) positions.set(event.id, result.length);
        result.push(event);
      }
    }
  }
  return result.sort((a, b) =>
    a.timestamp && b.timestamp ? a.timestamp.localeCompare(b.timestamp) : 0,
  );
}

function stateStatus(event: ConversationEvent): string | undefined {
  if (event.kind !== "ConversationStateUpdateEvent") return undefined;
  const value =
    event.key === "full_state"
      ? asRecord(event.value)?.execution_status
      : event.key === "execution_status"
        ? event.value
        : undefined;
  return typeof value === "string" ? value : undefined;
}

export class Session implements ConversationSession {
  private snapshot: ConversationSnapshot = {
    conversation: null,
    events: [],
    items: [],
    status: "idle",
    connection: "disconnected",
    loading: false,
    loadingOlder: false,
    hasOlder: false,
    sending: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private owners = 0;
  private disposed = false;
  private generation = 0;
  private stateRevision = 0;
  private stream?: ConversationEventStream;
  private refreshPromise?: Promise<void>;
  private olderPromise?: Promise<void>;
  private olderCursor?: string;
  private historyLoaded = false;
  private historyIds = new Set<string>();
  private pendingSends = 0;

  constructor(
    readonly conversationId: string,
    private readonly client: ConversationClient,
    private readonly options: AgentServicesOptions,
    private readonly onDispose: () => void,
  ) {}

  getSnapshot = (): ConversationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.assertOpen();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private assertOpen(): void {
    if (this.disposed) throw new Error("Conversation session is disposed");
  }

  private current(generation: number): boolean {
    return !this.disposed && this.generation === generation;
  }

  private publish(patch: Partial<ConversationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private eventPatch(
    events: readonly ConversationEvent[],
  ): Pick<ConversationSnapshot, "events" | "items"> {
    return { events, items: projectEvents(events) };
  }

  private invalidate(): void {
    this.generation++;
    this.refreshPromise = undefined;
    this.olderPromise = undefined;
    this.pendingSends = 0;
    const events = this.snapshot.events.filter(
      (event) => event.kind !== "StreamingDeltaEvent",
    );
    this.publish({
      ...this.eventPatch(events),
      loading: false,
      loadingOlder: false,
      sending: false,
    });
  }

  connect = (): (() => void) => {
    this.assertOpen();
    this.owners++;
    if (this.owners === 1) {
      this.publish({ connection: "connecting" });
      const stream = new ConversationEventStream({
        url: buildConversationEventStreamUrl(
          this.options.host,
          this.conversationId,
        ),
        sessionApiKey: this.options.apiKey,
        createWebSocket: this.options.createWebSocket,
        reconnect: { enabled: true },
        onOpen: () => {
          if (this.stream !== stream) return;
          // Re-read after the socket opens; a pre-handshake REST response can miss events.
          this.invalidate();
          void this.refresh().catch(() => {});
        },
        onClose: () => {
          if (this.stream === stream) this.invalidate();
        },
        onStateChange: (state) => {
          if (this.stream !== stream) return;
          this.publish({
            connection: state.isConnected
              ? "connected"
              : state.isReconnecting
                ? "reconnecting"
                : "connecting",
            ...(state.error ? { error: state.error } : {}),
          });
        },
        onMessage: (message) => {
          if (this.stream !== stream) return;
          try {
            const value: unknown = JSON.parse(String(message.data));
            if (typeof asRecord(value)?.kind !== "string") return;
            this.receive(value as ConversationEvent);
          } catch {
            this.publish({
              error: new Error("Invalid conversation event frame"),
            });
          }
        },
      });
      this.stream = stream;
      stream.start();
      void this.refresh().catch(() => {});
    }
    let released = false;
    return () => {
      if (released || this.disposed) return;
      released = true;
      this.owners--;
      if (this.owners === 0) this.disconnect();
    };
  };

  private disconnect(): void {
    const stream = this.stream;
    this.stream = undefined;
    stream?.stop();
    this.invalidate();
    this.publish({ connection: "disconnected" });
  }

  private receive(event: ConversationEvent): void {
    const existing = event.id
      ? this.snapshot.events.find((item) => item.id === event.id)
      : undefined;
    if (existing && JSON.stringify(existing) === JSON.stringify(event)) return;
    const events = mergeEvents(this.snapshot.events, [event]);
    const status = stateStatus(event);
    if (status !== undefined) this.stateRevision++;
    this.publish({
      ...this.eventPatch(events),
      ...(status !== undefined
        ? {
            status,
            conversation: this.snapshot.conversation
              ? {
                  ...this.snapshot.conversation,
                  execution_status:
                    status as ConversationInfo["execution_status"],
                }
              : null,
          }
        : {}),
    });
  }

  refresh = (): Promise<void> => {
    if (this.disposed)
      return Promise.reject(new Error("Conversation session is disposed"));
    if (this.refreshPromise) return this.refreshPromise;
    const generation = this.generation;
    const revision = this.stateRevision;
    const initial = !this.historyLoaded;
    const knownIds = new Set(this.historyIds);
    this.publish({ loading: true, error: null });
    const fetchHistory = async () => {
      let cursor: string | undefined;
      let nextCursor: string | undefined;
      const seenCursors = new Set<string>();
      const events: ConversationEvent[] = [];
      do {
        const page = await this.client.searchEvents(this.conversationId, {
          limit: this.options.pageSize ?? 100,
          sort_order: "TIMESTAMP_DESC",
          page_id: cursor,
        });
        if (!this.current(generation))
          return { events: [], nextCursor: undefined };
        const incoming = page.items as unknown as ConversationEvent[];
        events.push(...incoming);
        nextCursor = page.next_page_id || undefined;
        if (
          initial ||
          incoming.some((event) => event.id && knownIds.has(event.id))
        )
          break;
        if (nextCursor && seenCursors.has(nextCursor))
          throw new Error("Repeated history pagination cursor");
        if (nextCursor) seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (cursor);
      return { events: events.reverse(), nextCursor };
    };
    const promise = Promise.all([
      this.client.getConversation(this.conversationId),
      fetchHistory(),
    ])
      .then(([conversation, history]) => {
        if (!this.current(generation)) return;
        if (initial) this.olderCursor = history.nextCursor;
        this.historyLoaded = true;
        for (const event of history.events)
          if (event.id) this.historyIds.add(event.id);
        const status =
          revision === this.stateRevision
            ? conversation.execution_status
            : this.snapshot.status;
        this.publish({
          ...this.eventPatch(mergeEvents(history.events, this.snapshot.events)),
          conversation: {
            ...conversation,
            execution_status: status as ConversationInfo["execution_status"],
          },
          status,
          hasOlder: Boolean(this.olderCursor),
        });
      })
      .catch((error: unknown) => {
        if (this.current(generation)) this.publish({ error: errorOf(error) });
        throw errorOf(error);
      })
      .finally(() => {
        if (this.current(generation)) {
          this.refreshPromise = undefined;
          this.publish({ loading: false });
        }
      });
    this.refreshPromise = promise;
    return promise;
  };

  loadOlder = (): Promise<void> => {
    if (this.disposed)
      return Promise.reject(new Error("Conversation session is disposed"));
    if (this.olderPromise) return this.olderPromise;
    if (!this.olderCursor) return Promise.resolve();
    const generation = this.generation;
    const cursor = this.olderCursor;
    this.publish({ loadingOlder: true, error: null });
    const promise = this.client
      .searchEvents(this.conversationId, {
        limit: this.options.pageSize ?? 100,
        sort_order: "TIMESTAMP_DESC",
        page_id: cursor,
      })
      .then((page) => {
        if (!this.current(generation)) return;
        if (page.next_page_id === cursor)
          throw new Error("Repeated history pagination cursor");
        const events = (page.items as unknown as ConversationEvent[])
          .slice()
          .reverse();
        this.olderCursor = page.next_page_id || undefined;
        for (const event of events) if (event.id) this.historyIds.add(event.id);
        this.publish({
          ...this.eventPatch(mergeEvents(events, this.snapshot.events)),
          hasOlder: Boolean(this.olderCursor),
        });
      })
      .catch((error: unknown) => {
        if (this.current(generation)) this.publish({ error: errorOf(error) });
        throw errorOf(error);
      })
      .finally(() => {
        if (this.current(generation)) {
          this.olderPromise = undefined;
          this.publish({ loadingOlder: false });
        }
      });
    this.olderPromise = promise;
    return promise;
  };

  private async command(
    operation: () => Promise<unknown>,
    sending = false,
  ): Promise<void> {
    this.assertOpen();
    const generation = this.generation;
    if (sending) this.pendingSends++;
    this.publish({ error: null, sending: this.pendingSends > 0 });
    try {
      await operation();
    } catch (error) {
      if (this.current(generation)) this.publish({ error: errorOf(error) });
      throw errorOf(error);
    } finally {
      if (this.current(generation) && sending) {
        this.pendingSends--;
        this.publish({ sending: this.pendingSends > 0 });
      }
    }
  }

  sendMessage = (text: string): Promise<void> => {
    if (!text.trim()) return Promise.reject(new Error("A message is required"));
    const message: Message = {
      role: "user",
      content: [{ type: "text", text }],
    };
    return this.command(
      () => this.client.sendEvent(this.conversationId, message, { run: true }),
      true,
    );
  };

  pause = (): Promise<void> =>
    this.command(() => this.client.pauseConversation(this.conversationId));
  resume = (): Promise<void> =>
    this.command(() => this.client.runConversation(this.conversationId));
  confirm = (accept: boolean, reason?: string): Promise<void> =>
    this.command(() =>
      this.client.respondToConfirmation(this.conversationId, {
        accept,
        ...(reason === undefined ? {} : { reason }),
      }),
    );

  reconnect = (): void => {
    this.assertOpen();
    if (!this.stream) return;
    this.invalidate();
    this.stream.reconnect();
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disconnect();
    this.disposed = true;
    this.owners = 0;
    this.listeners.clear();
    this.onDispose();
  };
}
