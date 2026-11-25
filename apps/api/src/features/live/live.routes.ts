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

export const liveRoutes = protectedRouter().get("/", async (c) => {
  const userId = c.get("user").id;
  let closed = false;
  let emit: ((message: string) => void) | null = null;
  const pending: string[] = [];
  let end = () => {
    closed = true;
  };

  // Start following before opening the SSE response so a stream limit rejection answers with 429
  // instead of a 200 text/event-stream
  const stop = await liveService.followChanges(userId, {
    send: (message) => {
      if (emit) emit(message);
      else pending.push(message);
    },
    close: () => end(),
  });

  return streamSSE(c, async (stream) => {
    const ended = new Promise<void>((resolve) => {
      end = () => {
        closed = true;
        resolve();
      };
      if (closed) resolve();
    });
    stream.onAbort(() => end());
    // Each message is a topic to refetch; never any data from it
    emit = (message) => void stream.writeSSE({ data: message }).catch(end);

    const ping = setInterval(
      () => void stream.write(": ping\n\n").catch(end),
      PING_INTERVAL.total("milliseconds"),
    );
    const lifetime = setTimeout(() => end(), MAX_LIFETIME.total("milliseconds"));
    try {
      if (closed) return;
      // The app refetches when it hears "ready" after a reconnect, in case it missed something
      await stream.writeSSE({ data: "ready", retry: RECONNECT_DELAY.total("milliseconds") });
      for (const message of pending.splice(0)) emit(message);
      await ended;
    } finally {
      clearInterval(ping);
      clearTimeout(lifetime);
      stop();
    }
  });
});
