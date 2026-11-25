import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watch } from "./live-changes.ts";
import { findMembership } from "../households/households.service.ts";
import { followChanges, MAX_STREAMS_PER_USER } from "./live.service.ts";

vi.mock("./live-changes.ts", () => ({ watch: vi.fn() }));
vi.mock("../households/households.service.ts", () => ({ findMembership: vi.fn() }));

const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
});

describe("following changes", () => {
  it("stops listening and frees the slot when the first membership lookup fails", async () => {
    const stop = vi.fn();
    vi.mocked(watch).mockResolvedValue(stop);
    vi.mocked(findMembership).mockRejectedValueOnce(new Error("The database is slow"));

    await expect(followChanges("sam", { send: vi.fn(), close: vi.fn() })).rejects.toThrow(
      "The database is slow",
    );
    expect(stop).toHaveBeenCalledOnce();

    // Slot was freed: sam can still open MAX_STREAMS_PER_USER streams
    vi.mocked(findMembership).mockResolvedValue(null);
    for (let i = 0; i < MAX_STREAMS_PER_USER; i++) {
      cleanups.push(await followChanges("sam", { send: vi.fn(), close: vi.fn() }));
    }
  });

  it("keeps listening when the stream starts and unsubscribes once when stopped", async () => {
    const stop = vi.fn();
    vi.mocked(watch).mockResolvedValue(stop);
    vi.mocked(findMembership).mockResolvedValue(null);

    const release = await followChanges("sam", { send: vi.fn(), close: vi.fn() });
    expect(stop).not.toHaveBeenCalled();

    release();
    release();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("caps concurrent streams per user, even when opened in parallel", async () => {
    vi.mocked(watch).mockImplementation(() => Promise.resolve(vi.fn()));
    vi.mocked(findMembership).mockResolvedValue(null);

    const attempts = await Promise.allSettled(
      Array.from({ length: MAX_STREAMS_PER_USER + 2 }, () =>
        followChanges("sam", { send: vi.fn(), close: vi.fn() }),
      ),
    );
    const opened = attempts.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const rejected = attempts.filter((r) => r.status === "rejected").map((r) => r.reason);
    cleanups.push(...opened);

    expect(opened).toHaveLength(MAX_STREAMS_PER_USER);
    expect(rejected).toHaveLength(2);
    for (const err of rejected) expect(err).toMatchObject({ code: "TOO_MANY_STREAMS" });

    // Another user has their own budget
    cleanups.push(await followChanges("alex", { send: vi.fn(), close: vi.fn() }));

    // Stopping one frees a slot for sam
    opened.pop()?.();
    cleanups.push(await followChanges("sam", { send: vi.fn(), close: vi.fn() }));
  });
});
