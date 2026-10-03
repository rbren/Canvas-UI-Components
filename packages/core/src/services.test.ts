import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversationClient,
  FileClient,
  ProfilesClient,
  ServerClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import { createAgentServices } from "./services";
import type { ConversationEvent } from "./events";
import type { AgentServices } from "./types";

function message(
  number: number,
  text = `Message ${number}`,
): ConversationEvent {
  return {
    kind: "MessageEvent",
    id: `m${number}`,
    timestamp: new Date(number * 1000).toISOString(),
    source: "agent",
    llm_message: { role: "assistant", content: [{ type: "text", text }] },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
  const state = {
    events: [] as ConversationEvent[],
    status: "idle",
    failHistory: false,
    failSend: false,
    beforeHistory: undefined as (() => Promise<void>) | undefined,
    beforeConversation: undefined as (() => Promise<void>) | undefined,
  };
  const requests: Array<{
    method: string;
    url: string;
    key: string | string[] | undefined;
    body: unknown;
  }> = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    requests.push({
      method: request.method!,
      url: request.url!,
      key: request.headers["x-session-api-key"],
      body,
    });
    response.setHeader("Content-Type", "application/json");
    if (url.pathname.endsWith("/events/search")) {
      const events = [...state.events].reverse();
      const cursor = url.searchParams.get("page_id");
      const start = cursor
        ? events.findIndex((event) => event.id === cursor) + 1
        : 0;
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const items = events.slice(start, start + limit);
      await state.beforeHistory?.();
      if (state.failHistory) {
        response.statusCode = 503;
        response.end(JSON.stringify({ detail: "History unavailable" }));
      } else
        response.end(
          JSON.stringify({
            items,
            next_page_id:
              start + limit < events.length ? items.at(-1)?.id : undefined,
          }),
        );
    } else if (
      request.method === "GET" &&
      url.pathname.includes("/api/conversations/")
    ) {
      const execution_status = state.status;
      await state.beforeConversation?.();
      response.end(
        JSON.stringify({
          id: url.pathname.split("/").at(-1),
          execution_status,
          confirmation_policy: {},
          activated_knowledge_skills: [],
          agent: { kind: "Agent", llm: { model: "test" } },
          workspace: {},
          persistence_dir: "",
        }),
      );
    } else if (request.method === "POST") {
      if (state.failSend && url.pathname.endsWith("/events"))
        response.statusCode = 503;
      response.end(JSON.stringify({ success: response.statusCode === 200 }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ detail: "Not found" }));
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const ws = new WebSocketServer({ server });
  const sockets: WebSocket[] = [];
  const socketUrls: string[] = [];
  const authFrames: unknown[] = [];
  ws.on("connection", (socket, request) => {
    sockets.push(socket);
    socketUrls.push(request.url!);
    socket.on("message", (data) => authFrames.push(JSON.parse(String(data))));
  });
  const services = new Set<AgentServices>();
  const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}/agent`;
  const create = (apiKey = "test-key") => {
    const instance = createAgentServices({
      host,
      apiKey,
      pageSize: 2,
      // The SDK accepts the browser WebSocket interface; ws supplies it in Node.
      createWebSocket: (url) =>
        new WebSocket(url) as unknown as globalThis.WebSocket,
    });
    services.add(instance);
    return instance;
  };
  cleanups.push(async () => {
    for (const service of services) service.close();
    for (const socket of sockets) socket.terminate();
    await new Promise<void>((resolve) => ws.close(() => resolve()));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { state, requests, ws, sockets, socketUrls, authFrames, create };
}

describe("agent services and sessions", () => {
  it("constructs browser-free typed clients and keeps sessions and credentials isolated", async () => {
    const f = await fixture();
    const one = f.create("one");
    const two = f.create("two");
    expect(one.conversations).toBeInstanceOf(ConversationClient);
    expect(one.settings).toBeInstanceOf(SettingsClient);
    expect(one.files).toBeInstanceOf(FileClient);
    expect(one.profiles).toBeInstanceOf(ProfilesClient);
    expect(one.server).toBeInstanceOf(ServerClient);
    expect(f.requests).toEqual([]);
    const first = one.createSession("a");
    const second = two.createSession("b");
    await first.refresh();
    await second.refresh();
    expect(first.getSnapshot().conversation?.id).toBe("a");
    expect(second.getSnapshot().conversation?.id).toBe("b");
    expect(
      f.requests
        .filter((request) => request.url.includes("/conversations/a"))
        .every((request) => request.key === "one"),
    ).toBe(true);
    expect(
      f.requests
        .filter((request) => request.url.includes("/conversations/b"))
        .every((request) => request.key === "two"),
    ).toBe(true);
    one.close();
    one.close();
    expect(() => one.createSession("a")).toThrow("closed");
    await expect(first.refresh()).rejects.toThrow("disposed");
    await second.refresh();
  });

  it("reuses sessions by conversation ID until disposal, sharing one reference-counted socket", async () => {
    const f = await fixture();
    const services = f.create();
    const first = services.createSession("a");
    const second = services.createSession("a");
    expect(first).toBe(second);
    expect(services.createSession("b")).not.toBe(first);
    const releaseFirst = first.connect();
    const releaseSecond = second.connect();
    await vi.waitFor(() =>
      expect(first.getSnapshot().connection).toBe("connected"),
    );
    expect(f.sockets).toHaveLength(1);
    releaseFirst();
    expect(second.getSnapshot().connection).toBe("connected");
    releaseSecond();
    expect(second.getSnapshot().connection).toBe("disconnected");
    first.dispose();
    expect(services.createSession("a")).not.toBe(first);
  });

  it("paginates, deduplicates live/history events, and reference-counts socket ownership", async () => {
    const f = await fixture();
    f.state.events = [message(1), message(2), message(3)];
    const session = f.create().createSession("a");
    const releaseA = session.connect();
    const releaseB = session.connect();
    await vi.waitFor(() =>
      expect(session.getSnapshot()).toMatchObject({
        connection: "connected",
        loading: false,
        hasOlder: true,
      }),
    );
    expect(f.sockets).toHaveLength(1);
    await vi.waitFor(() =>
      expect(f.authFrames).toEqual([
        { type: "auth", session_api_key: "test-key" },
      ]),
    );
    expect(f.socketUrls).toEqual(["/agent/sockets/events/a"]);
    expect(session.getSnapshot().events.map((event) => event.id)).toEqual([
      "m2",
      "m3",
    ]);
    f.sockets[0].send(JSON.stringify(message(3)));
    f.sockets[0].send(JSON.stringify(message(4)));
    await vi.waitFor(() => expect(session.getSnapshot().items).toHaveLength(3));
    const older = session.loadOlder();
    expect(session.loadOlder()).toBe(older);
    await older;
    expect(session.getSnapshot().events.map((event) => event.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    expect(session.getSnapshot().hasOlder).toBe(false);
    releaseA();
    releaseA();
    expect(session.getSnapshot().connection).toBe("connected");
    releaseB();
    expect(session.getSnapshot().connection).toBe("disconnected");
    await vi.waitFor(() => expect(f.ws.clients.size).toBe(0));
  });

  it("resynchronizes every page of a reconnect gap and resumes after StrictMode cleanup", async () => {
    const f = await fixture();
    f.state.events = [message(1), message(2)];
    const session = f.create().createSession("a");
    const release = session.connect();
    await vi.waitFor(() => expect(session.getSnapshot().items).toHaveLength(2));
    release();
    const releaseAgain = session.connect();
    await vi.waitFor(() => expect(f.sockets).toHaveLength(2));
    await vi.waitFor(() => expect(session.getSnapshot().loading).toBe(false));
    f.state.events.push(
      message(3),
      message(4),
      message(5),
      message(6),
      message(7),
    );
    f.sockets.at(-1)!.close(1012, "Restart");
    await vi.waitFor(() =>
      expect(session.getSnapshot().connection).toBe("reconnecting"),
    );
    await vi.waitFor(
      () =>
        expect(session.getSnapshot().events.map((event) => event.id)).toEqual([
          "m1",
          "m2",
          "m3",
          "m4",
          "m5",
          "m6",
          "m7",
        ]),
      { timeout: 4000 },
    );
    session.reconnect();
    await vi.waitFor(() => expect(f.sockets).toHaveLength(4));
    releaseAgain();
  });

  it("survives an immediate StrictMode connect-cleanup-connect cycle", async () => {
    const f = await fixture();
    f.state.events = [message(1)];
    const session = f.create().createSession("a");
    const release = session.connect();
    release();
    const releaseAgain = session.connect();
    await vi.waitFor(() =>
      expect(session.getSnapshot()).toMatchObject({
        connection: "connected",
        loading: false,
        items: [{ id: "m1" }],
      }),
    );
    releaseAgain();
    await vi.waitFor(() => expect(f.ws.clients.size).toBe(0));
  });

  it("keeps live execution state newer than a pending REST snapshot and handles actual streaming events", async () => {
    const f = await fixture();
    const session = f.create().createSession("a");
    const release = session.connect();
    await vi.waitFor(() =>
      expect(session.getSnapshot()).toMatchObject({
        connection: "connected",
        loading: false,
      }),
    );
    const held = deferred();
    f.state.beforeConversation = () => held.promise;
    const refreshing = session.refresh();
    f.sockets[0].send(
      JSON.stringify({
        kind: "ConversationStateUpdateEvent",
        id: "state",
        key: "full_state",
        value: { execution_status: "running" },
      }),
    );
    f.sockets[0].send(
      JSON.stringify({
        kind: "StreamingDeltaEvent",
        id: "delta-a",
        content: "Hello",
      }),
    );
    f.sockets[0].send(
      JSON.stringify({
        kind: "StreamingDeltaEvent",
        id: "delta-b",
        content: " world",
      }),
    );
    f.sockets[0].send(
      JSON.stringify({
        kind: "TokenEvent",
        id: "tokens",
        source: "agent",
        prompt_token_ids: [1],
        response_token_ids: [2],
      }),
    );
    await vi.waitFor(() =>
      expect(session.getSnapshot()).toMatchObject({
        status: "running",
        items: [{ text: "Hello world", streaming: true }],
      }),
    );
    held.resolve();
    await refreshing;
    expect(session.getSnapshot().conversation?.execution_status).toBe(
      "running",
    );
    f.sockets[0].send(
      JSON.stringify({
        kind: "ConversationStateUpdateEvent",
        id: "state",
        key: "execution_status",
        value: "paused",
      }),
    );
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe("paused"));
    expect(
      session.getSnapshot().events.filter((event) => event.id === "state"),
    ).toHaveLength(1);
    f.sockets[0].send(JSON.stringify(message(10, "Hello world!")));
    await vi.waitFor(() =>
      expect(session.getSnapshot().items).toEqual([
        {
          type: "message",
          id: "m10",
          role: "assistant",
          text: "Hello world!",
          images: [],
        },
      ]),
    );
    release();
  });

  it("surfaces retryable history failures and rejects sends without optimistic composer loss", async () => {
    const f = await fixture();
    const session = f.create().createSession("a");
    f.state.failHistory = true;
    await expect(session.refresh()).rejects.toThrow("503");
    expect(session.getSnapshot()).toMatchObject({
      loading: false,
      error: expect.any(Error),
      events: [],
    });
    f.state.failHistory = false;
    f.state.events = [message(1), message(2), message(3)];
    await session.refresh();
    f.state.failHistory = true;
    await expect(session.loadOlder()).rejects.toThrow("503");
    expect(session.getSnapshot()).toMatchObject({
      loadingOlder: false,
      hasOlder: true,
    });
    f.state.failHistory = false;
    await session.loadOlder();
    f.state.failSend = true;
    await expect(session.sendMessage("Keep this draft")).rejects.toThrow("503");
    expect(session.getSnapshot()).toMatchObject({
      sending: false,
      error: expect.any(Error),
    });
    expect(session.getSnapshot().items).toHaveLength(3);
    f.state.failSend = false;
    await session.sendMessage("Keep this draft");
    await session.pause();
    await session.resume();
    await session.confirm(false, "Not allowed");
    const posts = f.requests.filter((request) => request.method === "POST");
    expect(posts.map((request) => [request.url, request.body])).toEqual([
      [
        "/agent/api/conversations/a/events",
        {
          role: "user",
          content: [{ type: "text", text: "Keep this draft" }],
          run: true,
        },
      ],
      [
        "/agent/api/conversations/a/events",
        {
          role: "user",
          content: [{ type: "text", text: "Keep this draft" }],
          run: true,
        },
      ],
      ["/agent/api/conversations/a/pause", {}],
      ["/agent/api/conversations/a/run", {}],
      [
        "/agent/api/conversations/a/events/respond_to_confirmation",
        { accept: false, reason: "Not allowed" },
      ],
    ]);
    expect(posts.every((request) => request.key === "test-key")).toBe(true);
  });

  it("ignores pending responses after disposal and stops notifying subscribers", async () => {
    const f = await fixture();
    const held = deferred();
    f.state.beforeHistory = () => held.promise;
    f.state.events = [message(1)];
    const services = f.create();
    const session = services.createSession("a");
    let notifications = 0;
    session.subscribe(() => {
      notifications++;
    });
    const refresh = session.refresh();
    await vi.waitFor(() => expect(f.requests).toHaveLength(2));
    services.close();
    const snapshot = session.getSnapshot();
    const count = notifications;
    held.resolve();
    await refresh;
    expect(session.getSnapshot()).toBe(snapshot);
    expect(notifications).toBe(count);
    expect(snapshot).toMatchObject({
      connection: "disconnected",
      loading: false,
      events: [],
    });
  });

  it("rejects URL credentials and malformed service options before any transport starts", () => {
    for (const host of [
      "https://user:pass@example.com",
      "https://example.com?session_api_key=secret",
      "file:///tmp/server",
    ]) {
      expect(() => createAgentServices({ host })).toThrow("HTTP(S)");
    }
    expect(() =>
      createAgentServices({ host: "https://example.com", pageSize: 0 }),
    ).toThrow("pageSize");
  });
});
