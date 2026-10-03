import { createContext, useContext, type ReactNode } from "react";
export interface UILabels {
  chat: string;
  messages: string;
  message: string;
  messagePlaceholder: string;
  send: string;
  sending: string;
  composerHint: string;
  user: string;
  assistant: string;
  system: string;
  streaming: string;
  openImage: string;
  image: string;
  input: string;
  output: string;
  risk: string;
  idle: string;
  paused: string;
  stuck: string;
  finished: string;
  deleting: string;
  waitingForConfirmation: string;
  running: string;
  completed: string;
  error: string;
  rejected: string;
  connected: string;
  connecting: string;
  disconnected: string;
  reconnecting: string;
  retry: string;
  reconnect: string;
  pause: string;
  resume: string;
  approve: string;
  reject: string;
  confirmation: string;
  loading: string;
  loadOlder: string;
  latest: string;
  emptyMessages: string;
  conversations: string;
  emptyConversations: string;
  newConversation: string;
  loadMore: string;
  settings: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  apiKeyHint: string;
  saveSettings: string;
  saving: string;
  saved: string;
  unsupportedSettings: string;
}
export const defaultLabels: Readonly<UILabels> = {
  chat: "Agent chat",
  messages: "Messages",
  message: "Message",
  messagePlaceholder: "Write a message…",
  send: "Send",
  sending: "Sending…",
  composerHint: "Enter to send · Shift+Enter for a new line",
  user: "You",
  assistant: "Assistant",
  system: "System",
  streaming: "Responding…",
  openImage: "Open image",
  image: "Image",
  input: "Input",
  output: "Result",
  risk: "Risk",
  idle: "Ready",
  paused: "Paused",
  stuck: "Needs attention",
  finished: "Finished",
  deleting: "Deleting…",
  waitingForConfirmation: "Awaiting approval",
  running: "Running",
  completed: "Completed",
  error: "Error",
  rejected: "Rejected",
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting…",
  retry: "Retry",
  reconnect: "Reconnect",
  pause: "Stop",
  resume: "Resume",
  approve: "Approve",
  reject: "Reject",
  confirmation: "The agent is waiting for your approval.",
  loading: "Loading…",
  loadOlder: "Load older messages",
  latest: "Jump to latest",
  emptyMessages: "Start a conversation with your agent.",
  conversations: "Conversations",
  emptyConversations: "No conversations yet.",
  newConversation: "New conversation",
  loadMore: "Load more",
  settings: "Model settings",
  model: "Model",
  apiKey: "API key",
  baseUrl: "Base URL",
  apiKeyHint: "Leave blank to keep the existing key.",
  saveSettings: "Save settings",
  saving: "Saving…",
  saved: "Settings saved.",
  unsupportedSettings: "Model settings are managed by this agent’s provider.",
};
const LabelsContext = createContext<Readonly<UILabels>>(defaultLabels);
export interface UILabelsProviderProps {
  labels: Partial<UILabels>;
  children: ReactNode;
}
export function UILabelsProvider({ labels, children }: UILabelsProviderProps) {
  const inherited = useContext(LabelsContext);
  return (
    <LabelsContext.Provider value={{ ...inherited, ...labels }}>
      {children}
    </LabelsContext.Provider>
  );
}
export function useUILabels(overrides?: Partial<UILabels>): Readonly<UILabels> {
  return { ...useContext(LabelsContext), ...overrides };
}
