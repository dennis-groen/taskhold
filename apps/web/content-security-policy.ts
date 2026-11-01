// Adds a Content Security Policy to the built index.html. Build only: the dev server injects its
// own inline scripts for hot reloading, which a strict policy would block.
import { createHash } from "node:crypto";

import type { Plugin } from "vite";

const POLICY: Record<string, string[]> = {
  "default-src": ["'self'"],
  // Inline scripts are allowed by hash only; the plugin adds them (today: the theme script)
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  // Google profile pictures, and small images Vite inlines
  "img-src": ["'self'", "data:", "https://*.googleusercontent.com"],
  "font-src": ["'self'", "data:"],
  // The API is on the same origin (/api)
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'self'"],
};

// <script> elements without a src attribute, and their content
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

export function contentSecurityPolicy(): Plugin {
  return {
    name: "taskhold:content-security-policy",
    apply: "build",
    transformIndexHtml: {
      // After every other transform, so the hashes match the HTML that ships
      order: "post",
      handler(html) {
        const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
          ([, body]) =>
            `'sha256-${createHash("sha256")
              .update(body ?? "")
              .digest("base64")}'`,
        );
        const directives = { ...POLICY, "script-src": [...POLICY["script-src"], ...hashes] };
        const content = Object.entries(directives)
          .map(([name, sources]) => `${name} ${sources.join(" ")}`)
          .join("; ");
        return {
          html,
          // First in <head>, so it applies before the inline theme script runs
          tags: [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content },
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  };
}
