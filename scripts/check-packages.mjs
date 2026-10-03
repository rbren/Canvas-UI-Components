import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consumer = mkdtempSync(join(tmpdir(), "canvas-consumer-"));
const react = process.env.REACT_VERSION || "19.2.0";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (command, args, cwd = consumer) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });

try {
  for (const name of ["core", "react", "ui"]) {
    run(
      npm,
      ["pack", "--pack-destination", consumer],
      join(root, "packages", name),
    );
  }
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  const tarballs = readdirSync(consumer)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => join(consumer, name));
  run(npm, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...tarballs,
    `react@${react}`,
    `react-dom@${react}`,
    `@types/react@${react.startsWith("18.") ? "18" : "19"}`,
    `@types/react-dom@${react.startsWith("18.") ? "18" : "19"}`,
  ]);
  writeFileSync(
    join(consumer, "consumer.tsx"),
    `
    import { createAgentServices, type ChatItem } from '@openhands/canvas-core';
    import { AgentProvider, ConversationProvider, useConversation } from '@openhands/canvas-react';
    import { AgentChat, ChatPanel, MessageList, ChatComposer, SettingsPanel } from '@openhands/canvas-ui';
    import '@openhands/canvas-ui/styles.css';
    const services = createAgentServices({host: 'https://agent.example.test/prefix'});
    const items: ChatItem[] = [{type:'message',id:'sample',role:'assistant',text:'Hello',images:[]}];
    export const composite = <AgentChat services={services} conversationId="test" />;
    export const custom = <AgentProvider services={services}><ConversationProvider conversationId="test"><ChatPanel /></ConversationProvider><SettingsPanel /></AgentProvider>;
    export const presentational = <><MessageList items={items}/><ChatComposer onSend={async (_text) => {}}/></>;
    export const Hook = () => <span>{useConversation().status}</span>;
  `,
  );
  run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--moduleResolution",
    "bundler",
    "--module",
    "esnext",
    "--jsx",
    "react-jsx",
    "--target",
    "es2022",
    "consumer.tsx",
  ]);
  writeFileSync(
    join(consumer, "ssr.mjs"),
    `
    import assert from 'node:assert/strict';
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import { createAgentServices } from '@openhands/canvas-core';
    import { AgentChat } from '@openhands/canvas-ui';
    globalThis.fetch = () => { throw new Error('Network access during SSR'); };
    const services = createAgentServices({host:'https://agent.example.test/prefix'});
    const html = renderToString(createElement(AgentChat, {services, conversationId:'ssr'}));
    assert.ok(html.includes('textarea'));
    services.close();
    console.log('Packed packages: SSR passed on React ${react}');
  `,
  );
  run(process.execPath, ["ssr.mjs"]);
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [join(consumer, "consumer.tsx")],
    outfile: join(consumer, "dist/app.js"),
    platform: "browser",
    format: "esm",
    bundle: true,
    metafile: true,
    logLevel: "warning",
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (
    inputs.some((name) =>
      /react-router|posthog|monaco-editor|\/src\/routes\//.test(name),
    )
  ) {
    throw new Error("App-specific dependency leaked into the browser bundle");
  }
  const uiSource = readFileSync(
    join(consumer, "node_modules/@openhands/canvas-ui/dist/index.js"),
    "utf8",
  );
  if (!uiSource.startsWith('"use client";'))
    throw new Error("React client boundary was lost during packaging");
  console.log(
    `Packed packages: TypeScript, browser bundle, styles, and client boundaries passed on React ${react}`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
