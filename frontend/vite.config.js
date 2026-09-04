import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PWA-Konfiguration (Manifest, Service Worker, Icons) folgt in Etappe 5.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
