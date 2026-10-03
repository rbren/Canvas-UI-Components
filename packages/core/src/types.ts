import type { ConversationInfo } from "@openhands/typescript-client";
import type { ConversationEvent } from "./events";
import type {
  ConversationClient,
  ConversationClientOptions,
  ConversationEventStreamOptions,
  FileClient,
  ProfilesClient,
  ServerClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";

export interface MessageItem {
  type: "message";
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  images: readonly string[];
  streaming?: boolean;
}

export interface ToolItem {
  type: "tool";
  id: string;
  name: string;
  summary?: string;
  input: unknown;
  output?: unknown;
  status: "running" | "completed" | "error" | "rejected";
  risk?: string;
}

export interface NoticeItem {
  type: "notice";
  id: string;
  text: string;
  level: "info" | "error";
}

export type ChatItem = MessageItem | ToolItem | NoticeItem;

export interface ConversationSnapshot {
  conversation: ConversationInfo | null;
  events: readonly ConversationEvent[];
  items: readonly ChatItem[];
  status: string;
  connection: "disconnected" | "connecting" | "connected" | "reconnecting";
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  sending: boolean;
  error: Error | null;
}

export interface ConversationSession {
  readonly conversationId: string;
  getSnapshot: () => ConversationSnapshot;
  subscribe: (listener: () => void) => () => void;
  connect(): () => void;
  refresh(): Promise<void>;
  loadOlder(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  confirm(accept: boolean, reason?: string): Promise<void>;
  reconnect(): void;
  dispose(): void;
}

export interface AgentServicesOptions extends ConversationClientOptions {
  createWebSocket?: ConversationEventStreamOptions["createWebSocket"];
  pageSize?: number;
}

export interface AgentServices {
  readonly conversations: ConversationClient;
  readonly settings: SettingsClient;
  readonly files: FileClient;
  readonly profiles: ProfilesClient;
  readonly server: ServerClient;
  createSession(conversationId: string): ConversationSession;
  close(): void;
}

export type { ConversationInfo } from "@openhands/typescript-client";
export type { ConversationEvent } from "./events";
export type { ConversationClientOptions } from "@openhands/typescript-client/clients";
