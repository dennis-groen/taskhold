import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/** IP address of the peer on the other end of the socket: the client, or the nearest proxy */
export function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // Not running on @hono/node-server (e.g. app.fetch in a script): no socket to read
    return undefined;
  }
}
