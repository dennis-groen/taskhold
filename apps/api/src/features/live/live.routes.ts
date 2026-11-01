// HTTP layer for live updates: a server-sent events stream per open app.
import { streamSSE } from "hono/streaming";

import { protectedRouter } from "../auth/auth.middleware.ts";
import * as liveService from "./live.service.ts";

// Proxies (Cloudflare's is 100 seconds) close connections that stay silent
const PING_INTERVAL = Temporal.Duration.from({ seconds: 25 });
// Streams end now and then and the browser reconnects, so a signed-out session doesn't keep one
// open: reconnecting checks the session again
const MAX_LIFETIME = Temporal.Duration.from({ minutes: 15 });
// How long the browser waits before reconnecting
const RECONNECT_DELAY = Temporal.Duration.from({ seconds: 3 });

export const liveRoutes = protectedRouter().get("/", (c) => {
  const userId = c.get("user").id;
  return streamSSE(c, async (stream) => {
    let end: () => void = noop;
    const ended = new Promise<void>((resolve) => {
      end = resolve;
    });
    stream.onAbort(() => end());
    // Each message is a topic to refetch; never any data from it
    const send = (message: string) => void stream.writeSSE({ data: message }).catch(end);

    const stop = await liveService.followChanges(userId, { send, close: end });
    const ping = setInterval(
      () => void stream.write(": ping\n\n").catch(end),
      PING_INTERVAL.total("milliseconds"),
    );
    const lifetime = setTimeout(() => end(), MAX_LIFETIME.total("milliseconds"));
    try {
      // The app refetches when it hears "ready" after a reconnect, in case it missed something
      await stream.writeSSE({ data: "ready", retry: RECONNECT_DELAY.total("milliseconds") });
      await ended;
    } finally {
      clearInterval(ping);
      clearTimeout(lifetime);
      stop();
    }
  });
});

function noop() {}
