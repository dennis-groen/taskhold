// Adds a Content Security Policy to the built index.html. Build only: the dev server injects its
// own inline scripts for hot reloading, which a strict policy would block.
import { createHash } from "node:crypto";

import type { Plugin } from "vite";

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

const POLICY: Record<string, string[]> = {
  "default-src": ["'self'"],
  // Inline scripts are allowed by hash only; the plugin adds them (today: the theme script)
  "script-src": ["'self'"],
  // An empty <style> only: input-otp adds one and fills it through the CSSOM (sheet.insertRule),
  // which CSP doesn't govern. Text put into a <style> is still checked, and blocked.
  "style-src": ["'self'", sha256("")],
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
        const hashes = [...html.matchAll(INLINE_SCRIPT)].map(([, body]) => sha256(body ?? ""));
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

// What sonner runs on import to put its stylesheet in a <style> element
const SONNER_INSERT_CSS = "function __insertCSS(code) {";

/**
 * Stops sonner adding its stylesheet as a <style> element, which the policy blocks (with a console
 * error on every page load). globals.css imports the same stylesheet, and overrides parts of it,
 * which an injected copy later in <head> would undo. Fails the build if sonner changes how it
 * injects, so the error doesn't quietly come back.
 */
export function withoutSonnerInlineStyles(): Plugin {
  return {
    name: "taskhold:without-sonner-inline-styles",
    apply: "build",
    transform(code, id) {
      if (!/[\\/]sonner[\\/]dist[\\/]index\.m?js$/.test(id)) return null;
      if (!code.includes(SONNER_INSERT_CSS)) {
        this.error(
          `sonner no longer injects its CSS with "${SONNER_INSERT_CSS}"; update content-security-policy.ts`,
        );
      }
      return { code: code.replace(SONNER_INSERT_CSS, `${SONNER_INSERT_CSS} return;`), map: null };
    },
  };
}
