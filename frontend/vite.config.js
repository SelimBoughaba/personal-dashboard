import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Absichtliche Allow-Liste statt "alles außer X": nur Module, bei denen ein
// veralteter Offline-Stand harmlos und der Nutzen (weiterhin sichtbar ohne
// Netz) klar ist. Auth, Settings, Backup, Mail und Gesundheitsdaten bleiben
// bewusst außen vor, selbst wenn ein zukünftiges API-Feld sensibel wird –
// eine neue Route landet hier nur, wenn sie explizit ergänzt wird.
const OFFLINE_CACHEABLE_PREFIXES = [
  "/api/tasks",
  "/api/calendar",
  "/api/invoices",
  "/api/areas",
  "/api/contracts",
  "/api/goals",
  "/api/notes",
  "/api/prompts",
  "/api/linkedin-posts",
];

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
            // Zuletzt geladene Daten aus der Allow-Liste oben bleiben
            // offline sichtbar: online immer neu laden und den Cache
            // aktualisieren, offline die letzte bekannte Antwort servieren.
            // Schreibende Requests (POST/PATCH/DELETE) werden nie gecacht.
            // Auth/Settings/Backup/Mail/Gesundheit sind bewusst NICHT
            // Teil dieser Liste (Punkt 9: keine sensiblen Antworten
            // pauschal persistent cachen) – der Cache wird außerdem bei
            // Logout, Passwortwechsel und Wiederherstellung geleert
            // (siehe api/client.js#clearOfflineCache).
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              OFFLINE_CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)),
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
