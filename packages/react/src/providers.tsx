"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type {
  AgentServices,
  ConversationSession,
} from "@openhands/canvas-core";
import { ConversationsStore, SettingsStore } from "./stores";

interface AgentContextValue {
  services: AgentServices;
  settings: SettingsStore;
  conversations: ConversationsStore;
}
const AgentContext = createContext<AgentContextValue | null>(null);
const ConversationContext = createContext<ConversationSession | null>(null);

export interface AgentProviderProps {
  services: AgentServices;
  children: ReactNode;
}

export function AgentProvider({ services, children }: AgentProviderProps) {
  const value = useMemo(
    () => ({
      services,
      settings: new SettingsStore(services),
      conversations: new ConversationsStore(services),
    }),
    [services],
  );
  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) throw new Error("Agent Server hooks require an AgentProvider");
  return context;
}

export function useAgentServices(): AgentServices {
  return useAgentContext().services;
}

export interface ConversationProviderProps {
  conversationId: string;
  children: ReactNode;
}

export function ConversationProvider({
  conversationId,
  children,
}: ConversationProviderProps) {
  const services = useAgentServices();
  const session = useMemo(
    () => services.createSession(conversationId),
    [services, conversationId],
  );
  useEffect(() => session.connect(), [session]);
  return (
    <ConversationContext.Provider value={session}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationSession(): ConversationSession {
  const session = useContext(ConversationContext);
  if (!session)
    throw new Error("Conversation hooks require a ConversationProvider");
  return session;
}

export function useConversation() {
  const session = useConversationSession();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const actions = useMemo(
    () => ({
      sendMessage: (text: string) => session.sendMessage(text),
      pause: () => session.pause(),
      resume: () => session.resume(),
      confirm: (accept: boolean, reason?: string) =>
        session.confirm(accept, reason),
      reconnect: () => session.reconnect(),
      refresh: () => session.refresh(),
      loadOlder: () => session.loadOlder(),
    }),
    [session],
  );
  return { ...snapshot, ...actions };
}

export function useSettings() {
  const { settings } = useAgentContext();
  const snapshot = useSyncExternalStore(
    settings.subscribe,
    settings.getSnapshot,
    settings.getServerSnapshot,
  );
  useEffect(() => {
    void settings.ensure().catch(() => {});
  }, [settings]);
  return { ...snapshot, refresh: settings.refresh, save: settings.save };
}

export function useConversations() {
  const { conversations } = useAgentContext();
  const snapshot = useSyncExternalStore(
    conversations.subscribe,
    conversations.getSnapshot,
    conversations.getServerSnapshot,
  );
  useEffect(() => {
    void conversations.ensure().catch(() => {});
  }, [conversations]);
  return {
    ...snapshot,
    refresh: conversations.refresh,
    loadMore: conversations.loadMore,
    create: conversations.create,
    remove: conversations.remove,
  };
}

export type UseConversationResult = ReturnType<typeof useConversation>;
export type UseSettingsResult = ReturnType<typeof useSettings>;
export type UseConversationsResult = ReturnType<typeof useConversations>;
