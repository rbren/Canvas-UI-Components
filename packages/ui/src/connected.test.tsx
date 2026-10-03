import { createServer } from "node:http";
import { StrictMode } from "react";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import {
  createAgentServices,
  type AgentServices,
} from "@openhands/canvas-core";
import { AgentProvider } from "@openhands/canvas-react";
import { AgentChat } from "./chat-panel";
import { SettingsPanel } from "./settings-panel";

const requests: { path: string; body: unknown }[] = [];
let status = "running";
let model = "initial-model";
let sequence = 0;
let failSettings = false;
const settings = () => ({
  agent_settings: { mcp_config: {}, llm: { model, api_key: "**********" } },
  conversation_settings: {},
  llm_api_key_is_set: true,
});
const server = createServer(async (request, response) => {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(Buffer.from(part));
  const body = parts.length
    ? JSON.parse(Buffer.concat(parts).toString())
    : undefined;
  const path = new URL(request.url!, "http://localhost").pathname;
  response.setHeader("Content-Type", "application/json");
  if (path === "/api/settings") {
    if (request.method === "PATCH") {
      requests.push({ path, body });
    }
    if (failSettings) {
      response.statusCode = 503;
      response.end('{"detail":"Settings unavailable"}');
      return;
    }
    if (request.method === "PATCH")
      model = body.agent_settings_diff.llm.model ?? model;
    response.end(JSON.stringify(settings()));
    return;
  }
  if (request.method === "POST") {
    requests.push({ path, body });
    if (path.endsWith("/pause")) broadcastStatus("paused");
    if (path.endsWith("/run")) broadcastStatus("running");
    if (path.endsWith("/respond_to_confirmation")) broadcastStatus("running");
    response.end("{}");
    return;
  }
  if (path.endsWith("/events/search")) {
    response.end(
      JSON.stringify({
        items: [
          {
            kind: "MessageEvent",
            id: "history",
            llm_message: {
              role: "assistant",
              content: [{ type: "text", text: "Welcome from history" }],
            },
          },
        ],
      }),
    );
    return;
  }
  response.end(
    JSON.stringify({
      id: path.split("/")[3],
      title: "Live agent",
      execution_status: status,
    }),
  );
});
const sockets = new WebSocketServer({ server });
function broadcast(event: unknown) {
  for (const socket of sockets.clients) socket.send(JSON.stringify(event));
}
function broadcastStatus(next: string) {
  status = next;
  broadcast({
    kind: "ConversationStateUpdateEvent",
    id: `state-${++sequence}`,
    key: "execution_status",
    value: status,
  });
}
let host: string;
let services: AgentServices[] = [];
function service() {
  const value = createAgentServices({ host });
  services.push(value);
  return value;
}
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  requests.length = 0;
  status = "running";
  model = "initial-model";
  failSettings = false;
});
afterEach(() => {
  cleanup();
  services.forEach((value) => value.close());
  services = [];
  for (const socket of sockets.clients) socket.terminate();
});
afterAll(async () => {
  sockets.close();
  server.close();
  await once(server, "close");
});

it("keeps exactly one transcript and composer while history loads in StrictMode", async () => {
  const services = service();
  render(
    <StrictMode>
      <AgentChat services={services} conversationId="strict" />
    </StrictMode>,
  );
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  await act(async () => {
    await services.createSession("strict").refresh();
  });
  expect(screen.getAllByRole("log")).toHaveLength(1);
  expect(screen.getAllByText("Welcome from history")).toHaveLength(1);
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
});

it("composes real providers, history, streaming, send, pause, resume, confirmation, and disconnect gating", async () => {
  const user = userEvent.setup();
  render(
    <AgentChat
      services={service()}
      conversationId="conversation"
      labels={{ send: "Send message" }}
    />,
  );
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(await screen.findByText("Welcome from history")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  await user.type(screen.getByRole("textbox"), "Hello agent");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(requests).toContainEqual({
      path: "/api/conversations/conversation/events",
      body: {
        role: "user",
        content: [{ type: "text", text: "Hello agent" }],
        run: true,
      },
    }),
  );
  broadcast({
    kind: "StreamingDeltaEvent",
    id: "stream",
    content: "Live response",
  });
  expect(await screen.findByText("Live response")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Stop" }));
  await user.click(await screen.findByRole("button", { name: "Resume" }));
  await screen.findByRole("button", { name: "Stop" });
  broadcastStatus("waiting_for_confirmation");
  await user.click(await screen.findByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(requests).toContainEqual({
      path: "/api/conversations/conversation/events/respond_to_confirmation",
      body: { accept: true },
    }),
  );
  await screen.findByRole("button", { name: "Stop" });
  broadcastStatus("waiting_for_confirmation");
  await user.click(await screen.findByRole("button", { name: "Reject" }));
  await waitFor(() =>
    expect(requests).toContainEqual({
      path: "/api/conversations/conversation/events/respond_to_confirmation",
      body: { accept: false },
    }),
  );
  for (const socket of sockets.clients) socket.close(1000);
  await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
});

it("recovers settings loading and saves a minimal patch through the real settings hook", async () => {
  const user = userEvent.setup();
  failSettings = true;
  render(
    <AgentProvider services={service()}>
      <SettingsPanel />
    </AgentProvider>,
  );
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  failSettings = false;
  await user.click(screen.getByRole("button", { name: "Retry" }));
  const input = await screen.findByLabelText("Model");
  await user.clear(input);
  await user.type(input, "updated-model");
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  expect(requests).toEqual([
    {
      path: "/api/settings",
      body: { agent_settings_diff: { llm: { model: "updated-model" } } },
    },
  ]);
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
});

it("isolates drafts across conversation switches and honors message renderer overrides", async () => {
  const user = userEvent.setup();
  const services = service();
  const renderMessage = (message: { text: string }) => (
    <p>Custom message: {message.text}</p>
  );
  const view = render(
    <AgentChat
      services={services}
      conversationId="first"
      renderMessage={renderMessage}
    />,
  );
  expect(
    await screen.findByText("Custom message: Welcome from history"),
  ).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  await user.type(
    screen.getByRole("textbox"),
    "Private draft for first conversation",
  );
  view.rerender(
    <AgentChat
      services={services}
      conversationId="second"
      renderMessage={renderMessage}
    />,
  );
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  expect(screen.getByRole("textbox")).toHaveValue("");
  await user.type(
    screen.getByRole("textbox"),
    "Second conversation message{Enter}",
  );
  await waitFor(() =>
    expect(requests).toContainEqual({
      path: "/api/conversations/second/events",
      body: {
        role: "user",
        content: [{ type: "text", text: "Second conversation message" }],
        run: true,
      },
    }),
  );
  expect(JSON.stringify(requests)).not.toContain("Private draft");
});

it("preserves failed settings edits but resets drafts, secrets, and errors on a backend switch", async () => {
  const user = userEvent.setup();
  const first = service();
  const second = service();
  const view = render(
    <AgentProvider services={first}>
      <SettingsPanel />
    </AgentProvider>,
  );
  const input = await screen.findByLabelText("Model");
  await user.clear(input);
  await user.type(input, "unsaved-first-model");
  await user.type(screen.getByLabelText("API key"), "private-first-key");
  failSettings = true;
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(input).toHaveValue("unsaved-first-model");
  expect(screen.getByLabelText("API key")).toHaveValue("private-first-key");
  failSettings = false;
  model = "second-backend-model";
  view.rerender(
    <AgentProvider services={second}>
      <SettingsPanel />
    </AgentProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Model")).toHaveValue("second-backend-model"),
  );
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
});
