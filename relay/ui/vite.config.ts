import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The relay Fastify server runs on its own port (default 4410, see
// relay/src/server/config.ts). In dev we proxy /v1 requests to it so the
// React app can call the API without worrying about CORS. In production,
// Fastify serves relay/ui/dist as static files and /v1 comes from the
// same origin.
const BACKEND = process.env.RELAY_BACKEND ?? "http://127.0.0.1:4410";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    proxy: {
      "/v1": {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
