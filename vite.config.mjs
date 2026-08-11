import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// SPA: single index.html entry (Vue Router) + bench.html for perf
const htmlEntries = {
  index: "index.html",
  bench: "bench.html",
};

export default defineConfig({
  plugins: [tailwindcss(), vue()],
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
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
