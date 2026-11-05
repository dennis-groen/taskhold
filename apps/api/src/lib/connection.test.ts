import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { describe, expect, it } from "vitest";

import { buildForwardedChain } from "./connection.ts";

// The real deployment: Cloudflare in front of Coolify's Traefik (10.0.0.2). Traefik replaces
// X-Forwarded-For with the address it saw, so behind Cloudflare that's an edge server.
const traefik = "::ffff:10.0.0.2";
const cloudflareEdge = "172.64.200.191";
const visitor = "192.0.2.42";

// As in production: Coolify's proxy network plus Cloudflare's ranges (shortened)
const trustedProxies = ["10.0.0.0/24", "172.64.0.0/13", "162.158.0.0/15", "2606:4700::/32"];

/** The client IP Better Auth rate-limits by, for a chain */
const clientOf = (chain: string | undefined) =>
  chain ? getIPFromHeader(chain, { trustedProxies }) : null;

describe("the forwarded chain handed to Better Auth", () => {
  it("is only the peer when no proxies are configured, whatever the request claims", () => {
    expect(
      buildForwardedChain({
        peer: visitor,
        forwardedFor: "1.2.3.4",
        cloudflareClient: "5.6.7.8",
        behindProxies: false,
      }),
    ).toBe(visitor);
  });

  it("starts with Cloudflare's visitor address, then the hops, then the peer", () => {
    expect(
      buildForwardedChain({
        peer: traefik,
        forwardedFor: cloudflareEdge,
        cloudflareClient: visitor,
        behindProxies: true,
      }),
    ).toBe(`${visitor}, ${cloudflareEdge}, ${traefik}`);
  });

  it("lets Better Auth find the real visitor behind Cloudflare and Traefik", () => {
    const chain = buildForwardedChain({
      peer: traefik,
      forwardedFor: cloudflareEdge,
      cloudflareClient: visitor,
      behindProxies: true,
    });
    expect(clientOf(chain)).toBe(visitor);
  });

  it("leaves a forged Cloudflare header behind the sender's real address", () => {
    // Someone connecting to the server directly, skipping Cloudflare: Traefik records their real
    // address, which isn't trusted, so Better Auth's right-to-left walk stops there
    const attacker = "203.0.113.9";
    expect(
      buildForwardedChain({
        peer: traefik,
        forwardedFor: attacker,
        cloudflareClient: "198.51.100.1",
        behindProxies: true,
      }),
    ).toBe(`198.51.100.1, ${attacker}, ${traefik}`);
    expect(
      clientOf(
        buildForwardedChain({
          peer: traefik,
          forwardedFor: attacker,
          cloudflareClient: "198.51.100.1",
          behindProxies: true,
        }),
      ),
    ).toBe(attacker);
  });

  it("is undefined without a socket, so the request goes through unchanged", () => {
    expect(
      buildForwardedChain({
        peer: undefined,
        forwardedFor: "1.2.3.4",
        cloudflareClient: undefined,
        behindProxies: true,
      }),
    ).toBeUndefined();
  });
});
