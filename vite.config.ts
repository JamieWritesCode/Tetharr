/**
 * Builds the web interface. In development it also passes /api requests through to the Tetharr server running alongside
 * it.
 */

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  plugins: [vue(), tailwindcss()],
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
