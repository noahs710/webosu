import { defineConfig } from "vite";
import { readdirSync } from "fs";

// Gradual rewrite: every top-level HTML page is a build entry. Pages migrate
// from classic <script src>/require.js to <script type="module"> one at a time;
// until then Vite dev serves their existing scripts untouched.
const htmlEntries = Object.fromEntries(
  readdirSync(".")
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(/\.html$/, ""), f])
);

export default defineConfig({
  // repo root is the site root; existing js/, css/, img/ ... served as static
  server: {
    port: 5173,
    hmr: { host: "127.0.0.1" },
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: { input: htmlEntries },
  },
});
