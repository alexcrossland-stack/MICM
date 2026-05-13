import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "artifacts/micm-platform/src"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      react: path.resolve(import.meta.dirname, "artifacts/micm-platform/node_modules/react"),
      "react-dom": path.resolve(import.meta.dirname, "artifacts/micm-platform/node_modules/react-dom"),
      "react-dom/server": path.resolve(import.meta.dirname, "artifacts/micm-platform/node_modules/react-dom/server.node.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "node",
  },
});
