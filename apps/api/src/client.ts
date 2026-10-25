// Typed Hono RPC client for the web app: https://hono.dev/docs/guides/rpc
import { hc } from "hono/client";

import type { app } from "./app.ts";

// Computing the client type here lets tsc do the heavy inference once when this
// project builds, instead of every editor keystroke on the web side
const client = hc<typeof app>("");
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<typeof app>(...args);

export { DetailedError, parseResponse } from "hono/client";
export type { InferRequestType, InferResponseType } from "hono/client";
export type { ApiErrorBody } from "./lib/errors.ts";
