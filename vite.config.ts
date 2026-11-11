import { defineConfig } from "vite";

// base "./" — działa zarówno pod domeną główną, jak i w podkatalogu (GitHub Pages)
export default defineConfig({
  base: "./",
  build: { target: "es2021", assetsInlineLimit: 0 },
  test: { environment: "node" },
} as never);
