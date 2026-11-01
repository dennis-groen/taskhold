import { hostname } from "node:os";

import { pino, stdTimeFunctions, type DestinationStream } from "pino";

import { env } from "../config/env.ts";
import { currentEvent } from "./wide-event.ts";

// Pretty printing is for people at a terminal. It runs in this thread, not pino's worker-thread
// transport, so nothing is lost when the process exits right after logging.
const destination: DestinationStream | undefined =
  env.LOG_FORMAT === "pretty"
    ? (await import("pino-pretty")).default({
        sync: true,
        ignore: "hostname,service,env",
        translateTime: "SYS:HH:MM:ss.l",
      })
    : undefined;

/**
 * The API's only logger. Requests are logged as wide events by the request logger; use this
 * directly for things that happen outside a request (startup, shutdown, crashes). Lines logged
 * during a request get its request_id, so they can be joined to its event.
 */
export const logger = pino(
  {
    level: env.LOG_LEVEL,
    // hostname tells instances apart when more than one runs
    base: { service: "taskhold-api", env: env.NODE_ENV, hostname: hostname() },
    timestamp: stdTimeFunctions.isoTime,
    // Collectors read "level": "error" more easily than pino's numbers; pino-pretty wants numbers
    ...(env.LOG_FORMAT === "json" && { formatters: { level: (label) => ({ level: label }) } }),
    mixin: () => {
      const event = currentEvent();
      return event ? { request_id: event.request_id } : {};
    },
  },
  destination,
);
