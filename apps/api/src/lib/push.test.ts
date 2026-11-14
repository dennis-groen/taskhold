import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPush } from "./push.ts";

const webPush = vi.hoisted(() => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { WebPushError, sendNotification: vi.fn(), setVapidDetails: vi.fn() };
});
vi.mock("web-push", () => webPush);

const device = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: "key",
  auth: "secret",
};
const message = { title: "1 chore today", body: "Bins", url: "/chores", tag: "chore-reminder" };

beforeEach(() => {
  webPush.sendNotification.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sending a push message", () => {
  it("says sent when the push service takes it", async () => {
    webPush.sendNotification.mockResolvedValue({ statusCode: 201 });

    expect(await sendPush(device, message)).toBe("sent");
    expect(webPush.sendNotification).toHaveBeenCalledExactlyOnceWith(
      { endpoint: device.endpoint, keys: { p256dh: "key", auth: "secret" } },
      JSON.stringify(message),
      expect.objectContaining({ TTL: 12 * 60 * 60, timeout: 10_000 }),
    );
  });

  it.each([404, 410])("says gone when the push service answers %i", async (statusCode) => {
    webPush.sendNotification.mockRejectedValue(new webPush.WebPushError("Gone", statusCode));
    expect(await sendPush(device, message)).toBe("gone");
  });

  it("says failed for any other answer or error", async () => {
    webPush.sendNotification.mockRejectedValue(new webPush.WebPushError("Busy", 500));
    expect(await sendPush(device, message)).toBe("failed");
    webPush.sendNotification.mockRejectedValue(new Error("socket hang up"));
    expect(await sendPush(device, message)).toBe("failed");
  });

  it("gives up after 20 seconds on a push service that never answers", async () => {
    vi.useFakeTimers();
    webPush.sendNotification.mockReturnValue(new Promise(() => {}));

    const result = sendPush(device, message);
    await vi.advanceTimersByTimeAsync(19_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toBe("failed");
  });
});
