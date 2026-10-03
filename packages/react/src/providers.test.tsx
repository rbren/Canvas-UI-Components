// @vitest-environment jsdom
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createAgentServices } from "@openhands/canvas-core";
import type { AgentServices } from "@openhands/canvas-core";
import { AgentProvider, useConversations, useSettings } from "./index";
import { SettingsStore } from "./stores";

const requests: {
  method: string;
  path: string;
  body: unknown;
  key: string | undefined;
}[] = [];
let delaySettings = false;
let heldResponse: ServerResponse | undefined;
let failSettings = false;
let ids = ["one"];
const settings = (model: string) => ({
  agent_settings: {
    mcp_config: { mcpServers: {} },
    llm: { model, api_key: "**********" },
  },
  conversation_settings: {},
  llm_api_key_is_set: true,
});
const conversation = (id: string) => ({
  id,
  title: id,
  execution_status: "idle",
});
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : null;
  const url = new URL(req.url!, "http://localhost");
  requests.push({
    method: req.method!,
    path: url.pathname,
    body,
    key: req.headers["x-session-api-key"] as string | undefined,
  });
  res.setHeader("Content-Type", "application/json");
  if (url.pathname.endsWith("/api/settings")) {
    if (req.method === "PATCH")
      return res.end(
        JSON.stringify(settings(body.agent_settings_diff.llm.model)),
      );
    if (failSettings) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ detail: "Unavailable" }));
    }
    if (delaySettings && url.pathname.startsWith("/a/")) {
      heldResponse = res;
      return;
    }
    return res.end(
      JSON.stringify(
        settings(url.pathname.startsWith("/b/") ? "model-b" : "model-a"),
      ),
    );
  }
  if (url.pathname.endsWith("/api/conversations/search")) {
    return res.end(JSON.stringify({ items: ids.map(conversation) }));
  }
  if (url.pathname.endsWith("/api/conversations") && req.method === "POST") {
    ids.push("new");
    return res.end(JSON.stringify(conversation("new")));
  }
  if (
    url.pathname.endsWith("/api/conversations/new") &&
    req.method === "DELETE"
  ) {
    ids = ids.filter((id) => id !== "new");
    return res.end("{}");
  }
  res.statusCode = 404;
  res.end("{}");
});
let host: string;
let services: AgentServices[] = [];
function service(prefix = "a") {
  const result = createAgentServices({
    host: `${host}/${prefix}`,
    apiKey: `key-${prefix}`,
  });
  services.push(result);
  return result;
}
function Model({ name }: { name: string }) {
  const state = useSettings();
  const llm = state.settings?.agent_settings.llm as
    | { model: string }
    | undefined;
  return (
    <section aria-label={name}>
      <span>{llm?.model ?? (state.error ? "failed" : "loading")}</span>
      <button
        onClick={() =>
          void state
            .save({ agent_settings_diff: { llm: { model: "updated" } } })
            .catch(() => {})
        }
      >
        Save {name}
      </button>
      <button onClick={() => void state.refresh().catch(() => {})}>
        Retry {name}
      </button>
    </section>
  );
}
function Catalog() {
  const state = useConversations();
  return (
    <>
      <output>{state.conversations.map((item) => item.id).join(",")}</output>
      <button onClick={() => void state.create({ agent: {} })}>Create</button>
      <button onClick={() => void state.remove("new")}>Delete</button>
    </>
  );
}

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  requests.length = 0;
  delaySettings = false;
  failSettings = false;
  heldResponse = undefined;
  ids = ["one"];
});
afterEach(() => {
  cleanup();
  heldResponse?.end(JSON.stringify(settings("old")));
  services.forEach((value) => value.close());
  services = [];
});
afterAll(async () => {
  server.close();
  await once(server, "close");
});

describe("per-provider state", () => {
  it("shares a single settings owner across consumers under StrictMode", async () => {
    render(
      <StrictMode>
        <AgentProvider services={service()}>
          <Model name="first" />
          <Model name="second" />
        </AgentProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getAllByText("model-a")).toHaveLength(2));
    expect(requests.filter((request) => request.method === "GET")).toHaveLength(
      1,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save first" }));
    await waitFor(() => expect(screen.getAllByText("updated")).toHaveLength(2));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(patch?.body).toEqual({
      agent_settings_diff: { llm: { model: "updated" } },
    });
    expect(patch?.key).toBe("key-a");
  });

  it("isolates services and ignores old requests after changing backend", async () => {
    delaySettings = true;
    const a = service();
    const b = service("b");
    const view = render(
      <AgentProvider services={a}>
        <Model name="active" />
      </AgentProvider>,
    );
    await waitFor(() => expect(heldResponse).toBeDefined());
    view.rerender(
      <AgentProvider services={b}>
        <Model name="active" />
      </AgentProvider>,
    );
    expect(await screen.findByText("model-b")).toBeInTheDocument();
    await act(async () => {
      heldResponse!.end(JSON.stringify(settings("stale")));
    });
    await waitFor(() =>
      expect(screen.queryByText("stale")).not.toBeInTheDocument(),
    );
    expect(requests.map((request) => request.key)).toEqual(["key-a", "key-b"]);
  });

  it("recovers from a failed settings read", async () => {
    failSettings = true;
    render(
      <AgentProvider services={service()}>
        <Model name="retry" />
      </AgentProvider>,
    );
    expect(await screen.findByText("failed")).toBeInTheDocument();
    failSettings = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry retry" }));
    expect(await screen.findByText("model-a")).toBeInTheDocument();
  });

  it("does not let a late GET overwrite a successful settings save", async () => {
    delaySettings = true;
    const store = new SettingsStore(service());
    const load = store.refresh();
    await waitFor(() => expect(heldResponse).toBeDefined());
    await store.save({ agent_settings_diff: { llm: { model: "new-model" } } });
    heldResponse!.end(JSON.stringify(settings("stale")));
    await load;
    expect(store.getSnapshot().settings?.agent_settings.llm).toEqual({
      model: "new-model",
      api_key: "**********",
    });
  });

  it("updates conversation catalog after creation and deletion using the SDK", async () => {
    render(
      <AgentProvider services={service()}>
        <Catalog />
      </AgentProvider>,
    );
    expect(await screen.findByText("one")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("new"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/^one$/),
    );
  });
});
