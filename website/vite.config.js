import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        docs: resolve(__dirname, "docs/index.html"),
        "docs-getting-started": resolve(__dirname, "docs/getting-started.html"),
        "docs-terminology": resolve(__dirname, "docs/terminology.html"),
        "docs-runtime": resolve(__dirname, "docs/runtime.html"),
        "docs-workspace": resolve(__dirname, "docs/workspace.html"),
        "docs-authentication": resolve(__dirname, "docs/authentication.html"),
        "docs-models": resolve(__dirname, "docs/models.html"),
        "docs-conversations": resolve(__dirname, "docs/conversations.html"),
        "docs-files": resolve(__dirname, "docs/files.html"),
        "docs-watchers": resolve(__dirname, "docs/watchers.html"),
        "docs-diagnostics": resolve(__dirname, "docs/diagnostics.html"),
        "docs-cli": resolve(__dirname, "docs/cli.html"),
        "docs-api": resolve(__dirname, "docs/api.html"),
        "docs-surface": resolve(__dirname, "docs/surface.html"),
      },
    },
  },
});
