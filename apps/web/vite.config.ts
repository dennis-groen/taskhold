import path from "node:path";

import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

import { contentSecurityPolicy } from "./content-security-policy.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    contentSecurityPolicy(),
    // A service worker that keeps the app itself (HTML, JS, CSS, fonts, icons) on the device, so
    // the installed app opens without a connection. API responses are never cached: they're private
    // and change all the time.
    VitePWA({
      // components/update-prompt.tsx asks before switching an open app to a new version
      registerType: "prompt",
      injectRegister: false,
      // The manifest is public/manifest.webmanifest, linked from index.html
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        // Every page is index.html; /api (including the Google sign-in callback) must reach the server
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // The first service worker takes over pages already open, so a later update can reload them.
        // Updates themselves still wait for the prompt.
        clientsClaim: true,
        // Shows chore reminders (public/push-handler.js)
        importScripts: ["/push-handler.js"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  // `vite preview` serves the production build, with its Content Security Policy, the same way
  preview: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
