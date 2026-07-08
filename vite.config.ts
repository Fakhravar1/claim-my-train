import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { prerenderSeoPages } from "./scripts/prerenderGuides";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Custom SW (src/sw.ts) so we can host push/notificationclick handlers.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false, // registered manually in main.tsx
      manifest: {
        name: "Qvitta — Ersättning för tågförseningar",
        short_name: "Qvitta",
        description:
          "En samlad plats för att ansöka om förseningsersättning – pendlare, nattåg och allt däremellan.",
        lang: "sv",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0E1B17",
        theme_color: "#0E1B17",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // og.png + the demo gif are shared/marketing assets, no need to precache.
        // The prerendered SEO pages (~700 html files) must stay OUT of the SW
        // precache — they'd bloat every install by megabytes for pages the app
        // renders client-side anyway.
        globIgnores: [
          "**/og.png",
          "**/genvag-demo.gif",
          "ersattning.html",
          "ersattning/**",
          "forseningar.html",
          "forseningar/**",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
    {
      // SEO prerender: writes static HTML for /ersattning (+ operator guides),
      // /forseningar (+ station stats pages) and sitemap.xml into dist/ after
      // the client build (scripts/prerenderGuides.ts). Lives inside
      // `vite build` so it runs on Lovable's pipeline too.
      name: "prerender-guides",
      apply: "build" as const,
      closeBundle() {
        prerenderSeoPages(path.resolve(__dirname, "dist"));
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
