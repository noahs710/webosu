import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Gradual rewrite: every top-level HTML page is a build entry. Pages migrate
// from classic <script src>/require.js to <script type="module"> one at a time;
// until then Vite dev serves their existing scripts untouched.
// SPA: single index.html entry (Vue Router handles all routes)
// 404.html + bench.html are separate standalone pages
const htmlEntries = {
  index: "index.html",
  "404": "404.html",
  bench: "bench.html",
};

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "vue": "vue/dist/vue.esm-bundler.js",
    },
  },
  // repo root is the site root; existing js/, css/, img/ ... served as static
  server: {
    port: 5173,
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
