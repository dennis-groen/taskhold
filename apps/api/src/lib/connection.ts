import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

import { env } from "../env.ts";

/** IP address of the peer on the other end of the socket: the client, or the nearest proxy */
export function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // Not running on @hono/node-server (e.g. app.fetch in a script): no socket to read
    return undefined;
  }
}

/**
 * The chain of addresses a request passed through, client first, as X-Forwarded-For lists them,
 * ending with the socket peer. Undefined when there's no socket (tests, scripts).
 *
 * Without TRUSTED_PROXIES it's only the peer: nothing in the request can be believed. Behind
 * proxies it's the forwarded chain plus the peer, and Better Auth walks it from the right, skipping
 * trusted proxies, to the first address it doesn't trust.
 *
 * Cloudflare puts the visitor's address in CF-Connecting-IP, while a reverse proxy behind it
 * (e.g. Traefik) records Cloudflare's edge server as the forwarded hop. So CF-Connecting-IP goes first.
 * It can't be forged by skipping Cloudflare: a direct connection's hop is the sender's own address,
 * which isn't trusted, so the walk stops there before reaching a made-up value.
 */
export function forwardedChain(c: Context): string | undefined {
  return buildForwardedChain({
    peer: socketAddress(c),
    forwardedFor: c.req.header("x-forwarded-for"),
    cloudflareClient: c.req.header("cf-connecting-ip"),
    behindProxies: env.TRUSTED_PROXIES.length > 0,
  });
}

export function buildForwardedChain(request: {
  peer: string | undefined;
  forwardedFor: string | undefined;
  cloudflareClient: string | undefined;
  behindProxies: boolean;
}): string | undefined {
  const { peer, forwardedFor, cloudflareClient, behindProxies } = request;
  if (!peer) return undefined;
  if (!behindProxies) return peer;
  return [cloudflareClient, forwardedFor, peer].filter(Boolean).join(", ");
}
