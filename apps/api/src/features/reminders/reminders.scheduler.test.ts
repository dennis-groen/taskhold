import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startReminders } from "./reminders.scheduler.ts";
import { sendDueReminders } from "./reminders.service.ts";

vi.mock("../../lib/push.ts", () => ({ pushConfigured: true }));
vi.mock("./reminders.service.ts", () => ({ sendDueReminders: vi.fn() }));

const nothingSent = { people: 0, notifications: 0, failed: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(sendDueReminders).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the reminder scheduler", () => {
  it("runs at once and then every minute, until it's stopped", async () => {
    vi.mocked(sendDueReminders).mockResolvedValue(nothingSent);

    const stop = startReminders();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendDueReminders).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendDueReminders).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(sendDueReminders).toHaveBeenCalledTimes(2);
  });

  it("doesn't start a run while the last one is still going", async () => {
    const finish: ((result: typeof nothingSent) => void)[] = [];
    vi.mocked(sendDueReminders)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish.push(resolve);
        }),
      )
      .mockResolvedValue(nothingSent);

    const stop = startReminders();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(sendDueReminders).toHaveBeenCalledTimes(1);

    finish[0]?.(nothingSent);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendDueReminders).toHaveBeenCalledTimes(2);
    stop();
  });

  it("carries on after a run that throws", async () => {
    vi.mocked(sendDueReminders).mockRejectedValueOnce(new Error("The database is down"));
    vi.mocked(sendDueReminders).mockResolvedValue(nothingSent);

    const stop = startReminders();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendDueReminders).toHaveBeenCalledTimes(2);
    stop();
  });
});
