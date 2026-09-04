import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Persönliches Dashboard für Aufgaben, Kalender, Mail und Rechnungen.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#071f19",
        theme_color: "#071f19",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Zuletzt geladene Daten (Aufgaben, Termine, Mails, Rechnungen)
            // bleiben offline sichtbar: online immer neu laden und den
            // Cache aktualisieren, offline die letzte bekannte Antwort
            // servieren. Schreibende Requests (POST/PATCH/DELETE) werden
            // bewusst nicht gecacht.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/api/") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
