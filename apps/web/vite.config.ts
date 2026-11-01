import path from "node:path";

import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

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
