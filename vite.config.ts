import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";

/** Em GitHub Pages o site fica em /Eletrica/ (CI define VITE_BASE). */
const base = process.env.VITE_BASE || "./";
const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        thumb: resolve(rootDir, "thumb/index.html")
      }
    }
  },
  plugins: [
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      includeAssets: ["assets/**/*", "manifest.webmanifest"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ]
});
