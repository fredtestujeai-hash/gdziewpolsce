import { defineConfig } from "vite";

// base "./" — działa zarówno pod domeną główną, jak i w podkatalogu (GitHub Pages)
export default defineConfig({
  base: "./",
  // dwie strony: polska (index.html) i angielska (en/index.html, generuje scripts/build_en_html.mjs)
  build: { target: "es2021", assetsInlineLimit: 0, rollupOptions: { input: { main: "index.html", en: "en/index.html" } } },
  test: { environment: "node" },
} as never);
