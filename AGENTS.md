# Canvas UI Components

This repository is a library-focused rewrite of OpenHands/OpenHands. Upstream application history is retained; there is no app router, Electron runtime, or Python server in the working tree.

## Boundaries

- `packages/core` (`@openhands/canvas-core`): framework-neutral service factory, conversation sessions, event projection. Use published `@openhands/typescript-client` classes and event types; do not redeclare REST routes or wire contracts.
- `packages/react` (`@openhands/canvas-react`): per-provider settings/catalog stores and reference-counted conversation subscriptions. No module-global credential or conversation state.
- `packages/ui` (`@openhands/canvas-ui`): independent presentation components and connected composites. React is a peer dependency. Optional `oh-` / `--oh-*` scoped styles; no host reset, router, or telemetry.
- `examples/playground`: a consumer of package exports, never source aliases. Gallery data is explicitly a fixture; live mode uses a user-configured Agent Server.

## Development

Use Node 22.12+ or 24+ and the committed npm lockfile. Dependencies are exact-pinned; React peer ranges intentionally support 18.3 and 19.

- `npm ci --ignore-scripts`
- `npm run check`: typecheck, tests, all package/example builds, independent tarball consumer checks.
- `REACT_VERSION=18.3.1 npm run test:packages`: verify React 18 consumer compatibility.
- `npm run format` / `npm run format:check`
- `npm run dev`: build libraries, then launch the example on loopback.

Tests use real local HTTP/WebSocket protocol fixtures. Run `npm test -- --project core` or `--project react`. Vitest projects must not inherit a root `include` array, which would merge UI tests into the Node project. Add a failing test before fixing behavioral regressions.

## Invariants and learned constraints

- The application owns `AgentServices`; providers do not close externally owned services. Session connections are reference-counted. Call `session.dispose()` to evict unused history and `services.close()` when ending a backend connection.
- Async results must not cross service/session generations. Settings patches never resend redacted credentials. Keys stay out of storage, URLs, console output, and static builds.
- ChatPanel's content is already keyed by session identity. Do not give sibling transcript/composer elements the same key: history hydration otherwise accumulates duplicate DOM under StrictMode.
- SDK 1.50.1's aggregate event union has intersected discriminator members. `core/src/events.ts` composes the SDK's exported types rather than copying wire schemas.
- The published SDK still uses `/sockets/events`; do not invent unpublished session-envelope contracts. Actual server 1.49.6 history and live model messaging were verified.
- The SDK HTTP client contains Node-only GET-with-body imports. `scripts/build-browser.mjs` bundles a browser entry with those unused transports isolated. Consumer browser builds must pass without Node polyfills. The Node entry uses the original SDK.
- `scripts/check-packages.mjs` installs tarballs in a clean temporary consumer and checks TypeScript, SSR, browser bundle, CSS, and client directives. Source-only tests do not replace this check.
- Do not add upstream desktop/deployment workflows or automatic npm publication. Update the existing README when public APIs change.
- Use a commit message file (`git commit -F`) for nontrivial messages in the persistent shell.
