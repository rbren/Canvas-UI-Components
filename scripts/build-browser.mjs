import { build } from "esbuild";

// The SDK's shared HTTP client includes Node-only GET-with-body support.
// None of the browser services use it; isolate those imports at our package boundary.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/browser.js",
  format: "esm",
  platform: "browser",
  target: "es2022",
  bundle: true,
  sourcemap: true,
  plugins: [
    {
      name: "node-only-sdk-transport",
      setup(plugin) {
        plugin.onResolve({ filter: /^node:https?$/ }, (args) => ({
          path: args.path,
          namespace: "node-only-sdk-transport",
        }));
        plugin.onLoad(
          { filter: /.*/, namespace: "node-only-sdk-transport" },
          () => ({
            contents:
              'export function request() { throw new Error("This SDK operation requires Node HTTP and is not supported in a browser"); }',
            loader: "js",
          }),
        );
      },
    },
  ],
});
