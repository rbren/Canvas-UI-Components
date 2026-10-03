import {
  ConversationClient,
  FileClient,
  ProfilesClient,
  ServerClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import { Session } from "./session";
import type { AgentServices, AgentServicesOptions } from "./types";

export function createAgentServices(
  options: AgentServicesOptions,
): AgentServices {
  const url = new URL(options.host);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Agent Server host must be an HTTP(S) URL without credentials, query, or fragment",
    );
  }
  if (
    options.pageSize !== undefined &&
    (!Number.isInteger(options.pageSize) || options.pageSize < 1)
  ) {
    throw new Error("pageSize must be a positive integer");
  }
  const config = { ...options, host: url.toString().replace(/\/$/, "") };
  const conversations = new ConversationClient(config);
  const settings = new SettingsClient(config);
  const files = new FileClient(config);
  const profiles = new ProfilesClient(config);
  const server = new ServerClient(config);
  const sessions = new Map<string, Session>();
  let closed = false;
  return {
    conversations,
    settings,
    files,
    profiles,
    server,
    createSession(conversationId) {
      if (closed) throw new Error("Agent services are closed");
      if (
        !conversationId.trim() ||
        /[/?#]/.test(conversationId) ||
        conversationId === "." ||
        conversationId === ".."
      ) {
        throw new Error("A valid conversation ID is required");
      }
      const existing = sessions.get(conversationId);
      if (existing) return existing;
      const session = new Session(conversationId, conversations, config, () =>
        sessions.delete(conversationId),
      );
      sessions.set(conversationId, session);
      return session;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const session of sessions.values()) session.dispose();
      for (const client of [conversations, settings, files, profiles, server])
        client.close();
    },
  };
}
