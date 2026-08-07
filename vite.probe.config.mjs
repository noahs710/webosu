import { defineConfig } from "vite";
export default defineConfig({
  build: { outDir: "dist-probe", emptyOutDir: true, rollupOptions: { input: "src/_probe.html" } },
});
