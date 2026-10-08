import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

/** Em GitHub Pages o site fica em /Eletrica/ (CI define VITE_BASE). */
const base = process.env.VITE_BASE || "./";

export default defineConfig({
  base,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    chunkSizeWarningLimit: 3000
  },
  plugins: [
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      // Só o que NÃO entra no globPatterns (evita duplicate revision no Workbox)
      includeAssets: ["manifest.webmanifest", "assets/brand/orcamento-modelo.pdf"],
      manifest: false,
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,webmanifest,ttf}"
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html"
      }
    })
  ]
});
