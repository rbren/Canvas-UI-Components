import { StrictMode, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createAgentServices } from "@openhands/canvas-core";
import type { AgentServices, ChatItem } from "@openhands/canvas-core";
import {
  AgentProvider,
  ConversationProvider,
  useConversations,
} from "@openhands/canvas-react";
import {
  ChatPanel,
  ChatComposer,
  MessageList,
  SettingsPanel,
} from "@openhands/canvas-ui";
import "@openhands/canvas-ui/styles.css";
import "./style.css";

const sample: ChatItem[] = [
  {
    type: "message",
    id: "user",
    role: "user",
    text: "Can you add a health check to the API?",
    images: [],
  },
  {
    type: "message",
    id: "agent",
    role: "assistant",
    text: "I’ll inspect the existing routes, add a small `/health` endpoint, and run the tests.",
    images: [],
  },
  {
    type: "tool",
    id: "tool",
    name: "terminal",
    summary: "Inspect API routes and run tests",
    input: { command: "npm test -- health.test.ts" },
    output:
      "✓ health.test.ts (3 tests)\nTest Files  1 passed\nTests       3 passed",
    status: "completed",
    risk: "LOW",
  },
  {
    type: "message",
    id: "result",
    role: "assistant",
    text: 'The endpoint is ready. It returns a minimal JSON response:\n\n```json\n{ "status": "ok" }\n```\n\n- Responds with **200 OK**\n- Does not expose internal configuration\n- Covered by three passing tests',
    images: [],
  },
];

function Gallery() {
  const [items, setItems] = useState(sample);
  return (
    <div className="demo-grid">
      <section className="demo-card chat-demo">
        <div className="card-heading">
          <span>01 / COMPOSABLE CHAT</span>
          <span className="fixture-badge">
            Static fixture · no agent connected
          </span>
        </div>
        <MessageList items={items} />
        <ChatComposer
          onSend={async (text) => {
            setItems((current) => [
              ...current,
              {
                type: "message",
                id: crypto.randomUUID(),
                role: "user",
                text,
                images: [],
              },
              {
                type: "notice",
                id: crypto.randomUUID(),
                level: "info",
                text: "This is the local component demo. Connect an Agent Server for live responses.",
              },
            ]);
          }}
        />
      </section>
      <aside className="explain">
        <section className="demo-card">
          <div className="card-heading">THREE INDEPENDENT LAYERS</div>
          <h3>Use what you need.</h3>
          <p>
            No router. No global store. No application shell. Start with the
            complete experience, or compose your own.
          </p>
          <div className="layer">
            <span className="layer-number">01</span>
            <div>
              <b>canvas-ui</b>
              <p>
                Messages, tools, composer, settings, and a ready-to-use chat
                panel.
              </p>
            </div>
          </div>
          <div className="layer">
            <span className="layer-number">02</span>
            <div>
              <b>canvas-react</b>
              <p>
                Providers and hooks. State is isolated to each server and
                conversation.
              </p>
            </div>
          </div>
          <div className="layer">
            <span className="layer-number">03</span>
            <div>
              <b>canvas-core</b>
              <p>
                Typed services, history, live events, and reconnect handling.
              </p>
            </div>
          </div>
        </section>
        <section className="demo-card code-card">
          <div className="card-heading">DROP IT INTO YOUR APP</div>
          <pre>
            <code>{`const services = createAgentServices({
  host: "https://your-agent-server",
  apiKey: sessionKey,
});

<AgentChat
  services={services}
  conversationId={id}
/>`}</code>
          </pre>
          <p>Import the optional stylesheet or bring your own design system.</p>
        </section>
      </aside>
    </div>
  );
}

function Workspace() {
  const catalog = useConversations();
  const [selected, select] = useState<string | null>(null);
  const [settings, showSettings] = useState(false);
  return (
    <div className="live-grid">
      <aside className="demo-card catalog">
        <div className="card-heading">YOUR CONVERSATIONS</div>
        <button
          onClick={() => void catalog.refresh().catch(() => {})}
          disabled={catalog.loading}
        >
          Refresh
        </button>
        {catalog.error && <p role="alert">{catalog.error.message}</p>}
        <nav aria-label="Conversations">
          {catalog.conversations.map((conversation) => (
            <button
              key={conversation.id}
              aria-current={selected === conversation.id ? "page" : undefined}
              onClick={() => select(conversation.id)}
            >
              {conversation.title || conversation.id}
            </button>
          ))}
        </nav>
        {catalog.hasMore && (
          <button
            disabled={catalog.loading}
            onClick={() => void catalog.loadMore().catch(() => {})}
          >
            Load more
          </button>
        )}
        <button onClick={() => showSettings(!settings)}>
          {settings ? "Hide settings" : "Server settings"}
        </button>
      </aside>
      <div className="demo-card live-panel">
        {settings ? (
          <SettingsPanel />
        ) : selected ? (
          <ConversationProvider key={selected} conversationId={selected}>
            <ChatPanel />
          </ConversationProvider>
        ) : (
          <div className="empty">
            <h2>Choose a conversation</h2>
            <p>
              The sidebar loads conversations from your Agent Server. Create
              conversations with{" "}
              <code>services.conversations.createConversation(payload)</code>,
              then select them here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<"components" | "live">("components");
  const [services, setServices] = useState<AgentServices | null>(null);
  const [host, setHost] = useState("http://localhost:8000");
  const [apiKey, setKey] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  useEffect(() => () => services?.close(), [services]);
  async function connect(event: FormEvent) {
    event.preventDefault();
    setConnecting(true);
    setError("");
    let next: AgentServices | undefined;
    try {
      next = createAgentServices({ host, apiKey: apiKey || undefined });
      await next.server.getServerInfo();
      setServices(next);
      setKey("");
    } catch (cause) {
      next?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setConnecting(false);
    }
  }
  return (
    <div className="playground">
      <header className="site-header">
        <a className="brand" href="#">
          <span className="brand-icon">⌘</span>
          <strong>
            Canvas <span>UI</span>
          </strong>
        </a>
        <span className="header-tag">REACT COMPONENT LIBRARY</span>
        <a
          className="source-link"
          href="https://github.com/OpenHands/Canvas-UI-Components"
          target="_blank"
          rel="noreferrer"
        >
          Source ↗
        </a>
      </header>
      <main>
        <div className="hero">
          <div>
            <p className="eyebrow">OPENHANDS / BUILDING BLOCKS</p>
            <h1>
              Your app. Your agent.
              <br />
              <span>Your experience.</span>
            </h1>
            <p className="lede">
              Composable React interfaces for Agent Server.
              <br />
              From a single message to a complete conversation.
            </p>
          </div>
          <div className="hero-detail">
            <span className="version">v0.1.0 · development preview</span>
            <p>
              React 18 & 19
              <br />
              TypeScript-first
              <br />
              Styles optional
            </p>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Playground view">
          <button
            role="tab"
            aria-selected={tab === "components"}
            onClick={() => setTab("components")}
          >
            Component playground
          </button>
          <button
            role="tab"
            aria-selected={tab === "live"}
            onClick={() => setTab("live")}
          >
            Connect Agent Server <span>↗</span>
          </button>
        </div>
        {tab === "components" ? (
          <Gallery />
        ) : services ? (
          <>
            <div className="connected-bar">
              <span>Connected to {host}</span>
              <button onClick={() => setServices(null)}>Disconnect</button>
            </div>
            <AgentProvider services={services}>
              <Workspace />
            </AgentProvider>
          </>
        ) : (
          <form
            className="demo-card connection-form"
            onSubmit={(event) => void connect(event)}
          >
            <p className="eyebrow">LIVE CONNECTION</p>
            <h2>Bring your own Agent Server.</h2>
            <p>
              Use the server origin, including any reverse-proxy prefix. Allow
              this page’s origin in the server CORS configuration. Your session
              key stays in memory.
            </p>
            <label>
              Agent Server URL
              <input
                type="url"
                required
                value={host}
                onChange={(event) => setHost(event.target.value)}
                disabled={connecting}
              />
            </label>
            <label>
              Session API key
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setKey(event.target.value)}
                disabled={connecting}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button disabled={connecting}>
              {connecting ? "Connecting…" : "Connect to server →"}
            </button>
          </form>
        )}
        <footer>
          Built on the official OpenHands TypeScript client. No telemetry. No
          hidden globals.
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
