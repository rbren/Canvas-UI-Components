import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ["core", "react", "ui"].map((name) => [
        `@openhands/canvas-${name}`,
        fileURLToPath(
          new URL(`./packages/${name}/src/index.ts`, import.meta.url),
        ),
      ]),
    ),
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          include: ["packages/core/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "react",
          include: ["packages/{react,ui}/**/*.test.{ts,tsx}"],
          environment: "jsdom",
        },
      },
    ],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
    testTimeout: 10000,
  },
});
