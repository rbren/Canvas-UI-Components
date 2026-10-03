# Canvas UI Components

Reusable React building blocks for applications that talk to an [OpenHands Agent Server](https://github.com/OpenHands/software-agent-sdk).

This repository is a library-focused rewrite of [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands), retaining its Git history and MIT license. The old application, router, desktop launcher, deployment stack, telemetry, and global stores are deliberately **not** part of these packages.

**Development preview: 0.1.0.** Packages are buildable and packable from this repository; they have **not been published to npm**. This is not feature parity with the entire Agent Canvas product.

## Packages

| Package | Responsibility | React required? |
| --- | --- | --- |
| `@openhands/canvas-core` | Explicitly configured SDK services, conversation sessions, history/live reconciliation, event-to-UI projection | No |
| `@openhands/canvas-react` | Per-server providers, conversation subscriptions, shared settings and catalog hooks | React 18.3 / 19 |
| `@openhands/canvas-ui` | Independent presentation components and a complete connected chat | React 18.3 / 19 |

The dependency direction is `official TypeScript client → core → React → UI`. No package requires React Router, Tailwind, Zustand, React Query, a particular authentication system, browser storage, or an application-wide singleton.

## Build and try it

Use Node **22.12+ or 24+** and npm.

```sh
npm ci --ignore-scripts
npm run check
npm run dev
```

The Vite example opens a component gallery and a **Connect Agent Server** view. It imports only public package exports. The gallery is explicitly a local fixture; it does not pretend to run an agent. Live mode connects to your server, lists existing conversations, and exposes the chat and settings components. Session credentials remain in memory.

To install into another application before an npm release:

```sh
npm run build
mkdir -p /tmp/canvas-packages
npm pack -w @openhands/canvas-core --pack-destination /tmp/canvas-packages
npm pack -w @openhands/canvas-react --pack-destination /tmp/canvas-packages
npm pack -w @openhands/canvas-ui --pack-destination /tmp/canvas-packages

# In the consuming React application, install all three tarballs together:
npm install /tmp/canvas-packages/openhands-canvas-{core,react,ui}-0.1.0.tgz
```

These are ESM packages with TypeScript declarations. React and React DOM are peer dependencies, not bundled copies. Core has separate browser and Node entry points; browser consumers need no Node HTTP polyfills. React entry points preserve `"use client"` for frameworks with React Server Components.

## Drop-in chat

```tsx
import { createAgentServices } from "@openhands/canvas-core";
import { AgentChat } from "@openhands/canvas-ui";
import "@openhands/canvas-ui/styles.css"; // Optional; no global CSS reset

// Create once per server/credential identity, not on every render.
const services = createAgentServices({
  host: "https://agents.example.com/backend", // Proxy prefixes are supported
  apiKey: sessionKey,
});

export function Chat({ conversationId }: { conversationId: string }) {
  return (
    <div style={{ height: 650 }}>
      <AgentChat services={services} conversationId={conversationId} />
    </div>
  );
}

// The application owns services; close them when that server connection ends.
// services.close();
```

`AgentChat` includes connection and execution status, history pagination, streamed messages, tool cards, a composer, retry/reconnect controls, pause/resume, and approval/rejection controls. Failed submissions retain the draft. Changing conversation or server identity resets private UI drafts and errors.

A conversation ID identifies an existing server conversation. To create one, pass your server's canonical creation payload to `services.conversations.createConversation(payload)` and use its returned `id`. The library deliberately does not choose a model, workspace, tools, or confirmation policy for your application.

## Compose your own experience

```tsx
import { AgentProvider, ConversationProvider, useConversation } from "@openhands/canvas-react";
import { MessageList, ChatComposer, SettingsPanel } from "@openhands/canvas-ui";

function MyChat() {
  const chat = useConversation();
  return (
    <>
      {chat.error && <p role="alert">{chat.error.message}</p>}
      <MessageList
        items={chat.items}
        hasOlder={chat.hasOlder}
        loadingOlder={chat.loadingOlder}
        onLoadOlder={chat.loadOlder}
        toolRenderers={{
          terminal: (tool) => (
            <details>
              <summary>{tool.summary || tool.name} · {tool.status}</summary>
              <pre>{JSON.stringify(tool.output ?? tool.input, null, 2)}</pre>
            </details>
          ),
        }}
      />
      <ChatComposer
        onSend={chat.sendMessage}
        pending={chat.sending}
        disabled={chat.connection !== "connected" || chat.loading}
      />
    </>
  );
}

// In your application:
// <AgentProvider services={services}>
//   <ConversationProvider conversationId={id}><MyChat /></ConversationProvider>
//   <SettingsPanel />
// </AgentProvider>
```

### React APIs

- `AgentProvider`: accepts application-owned `services`. Owns settings/catalog state for its subtree; it does not close externally owned services.
- `ConversationProvider`: accepts a `conversationId`. Connects on mount and releases its subscription on unmount. Multiple providers sharing the same services and ID share one reference-counted socket.
- `useConversation()`: returns the snapshot plus `sendMessage`, `pause`, `resume`, `confirm`, `refresh`, `loadOlder`, and `reconnect`.
- `useSettings()`: shared redacted settings, loading/saving/error state, `refresh`, and `save(patch)`.
- `useConversations()`: paginated catalog, `refresh`, `loadMore`, `create(payload)`, and `remove(id)`. Selection remains application-owned; clear your selected ID after deleting it.
- `useAgentServices()` / `useConversationSession()`: direct access to the scoped service/session.

All hooks require the corresponding provider and explain missing-provider errors. Multiple servers can coexist without sharing state. Imports and SSR renders open no sockets or network requests. For SSR, create services per request; never share credentials through a server-global instance.

### Standalone components

| Component | Main inputs |
| --- | --- |
| `Markdown` | `text`, optional code renderer and image opt-in |
| `MessageBubble` | `message`, optional header/content/footer renderers |
| `ToolCallCard` | `tool`, collapsible input/output, status/risk, custom renderers |
| `MessageList` | `items`, pagination, renderer registry, scroll-preserving transcript |
| `ChatComposer` | Async `onSend`, pending/disabled/error handling, IME-safe keyboard input |
| `ConnectionStatus` | Connection state and reconnect callback |
| `ConversationList` | Catalog, controlled `activeId`, selection/create/pagination callbacks |
| `SettingsForm` | Controlled `settings`, `value`, `onChange`, async `onSave` |
| `SettingsPanel` | Connected settings form using `useSettings` |
| `ChatPanel` | Connected chat within your existing providers |
| `AgentChat` | Self-contained provider composition for `services` + `conversationId` |

`SettingsForm` currently edits the OpenHands LLM model, API key, and base URL. It sends only changed fields and never copies a masked secret back into a write. ACP-specific configuration is not exposed as an LLM form. Other settings, profiles, skills, MCP, and workspace configuration can be composed using the official SDK's typed clients rather than a second set of API contracts.

Exported prop interfaces are the source of truth. Presentation components can be used without a server or provider. `ChatItem` is a presentation model; canonical wire event types remain owned by the SDK.

### Labels, styles, and security

Each component accepts optional `labels`, `className`, and `style`. Set defaults across a subtree with `UILabelsProvider`, or override labels on an individual component. No translation global is installed.

The optional stylesheet uses only `oh-` classes and `--oh-*` variables. Example theme overrides:

```css
.my-agent-chat {
  --oh-accent: #635bff;
  --oh-accent-hover: #4b44c7;
  --oh-user-surface: #f0efff;
  --oh-radius: 8px;
  --oh-font: system-ui, sans-serif;
}
```

Markdown does not execute raw HTML. Links are protocol-filtered. Images are user-activated links by default, avoiding automatic remote tracking requests; `allowImages` explicitly opts into loading them. Custom renderers are application code and must preserve the same trust boundary.

Configure Agent Server CORS to allow your application's origin and the `X-Session-API-Key` header. Use HTTPS outside loopback. Credentials are sent in SDK REST headers and the WebSocket authentication frame, never query parameters. The library does not persist keys or inject server credentials into static assets. Authentication, authorization, and safe agent execution policies remain the host application's responsibility.

## Framework-neutral services

```ts
import { createAgentServices } from "@openhands/canvas-core";

const services = createAgentServices({ host, apiKey, pageSize: 100 });
const session = services.createSession(conversationId);
const unsubscribe = session.subscribe(() => {
  const { items, connection, status, error } = session.getSnapshot();
  // Render, observe, or adapt this state to another framework.
});
const disconnect = session.connect();

await session.sendMessage("Inspect the project");
// await session.pause();
// await session.confirm(true);

unsubscribe();
disconnect();
session.dispose(); // Also removes the cached session; a later createSession starts fresh.
services.close();
```

`services.conversations`, `.settings`, `.files`, `.profiles`, and `.server` are the official SDK client instances, not endpoint reimplementations. The files service is host-scoped. For conversation-sandbox file APIs, construct an SDK `FileClient` with the owning `conversationId`.

Sessions merge REST history and live events by identity, retain pagination, refill reconnect gaps, and reject stale responses from a released connection. The final `disconnect` closes the socket and retry timers. Sessions cache history until `dispose()` or `services.close()`; dispose unused sessions in long-lived applications. SDK requests without cancellation support finish or reach the configured timeout, but their late results do not update a disconnected session.

## Verification and compatibility

```sh
npm run typecheck
npm test
npm run build:example
npm run test:packages
REACT_VERSION=18.3.1 npm run test:packages
npm run format:check
npm audit
```

Tests cover real local HTTP/WebSocket transport paths, reconnect/pagination, shared ownership, stale reads, provider isolation, settings diffs, rendering safety, keyboard behavior, scrolling, and connected chat controls. Callback spies are used at presentation boundaries; the SDK and hooks are exercised rather than replaced with mocks.

`test:packages` installs packed tarballs into a separate temporary consumer, checks public TypeScript imports, renders SSR, and bundles for the browser. It catches source aliases, missing CSS/declarations, lost client directives, bundled app dependencies, and Node import leaks that source-only tests miss.

Live verification used Agent Server **1.49.6**, including history, authenticated WebSocket connection, and sending/receiving a real model response through the example's React chat. Current transport follows the released SDK's `/sockets/events` API. The newer session-envelope protocol is not implemented until supported by the published SDK. Compatibility with other server versions is not exhaustively established.

### Scope of this rewrite

Included: messages/Markdown, tool/observation rendering, legacy token text streaming, agent controls, isolated React state, basic LLM settings, typed service access, theming/custom renderers, and a consumer playground.

Not included: Canvas routing, Electron, terminal emulator, browser remote control, Monaco/file explorer, cloud account login/discovery, automation administration, extension loading, or the old application's full settings catalog. These can be built as separate adapters/components without importing the original application shell. This repository does not start an Agent Server or publish packages automatically.

Upstream baseline: [`a6bba78ffd5a8b31620770f52383b1a2c0477fcd`](https://github.com/OpenHands/OpenHands/commit/a6bba78ffd5a8b31620770f52383b1a2c0477fcd). Earlier application code remains recoverable from Git history.

Initial library rewrite generated by the OpenHands AI agent on behalf of the repository requester.
