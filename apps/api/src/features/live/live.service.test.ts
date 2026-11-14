import { beforeEach, describe, expect, it, vi } from "vitest";

import { watch } from "../../lib/live-changes.ts";
import { findMembership } from "../households/households.service.ts";
import { followChanges } from "./live.service.ts";

vi.mock("../../lib/live-changes.ts", () => ({ watch: vi.fn() }));
vi.mock("../households/households.service.ts", () => ({ findMembership: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("following changes", () => {
  it("stops listening when the first membership lookup fails", async () => {
    const stop = vi.fn();
    vi.mocked(watch).mockResolvedValue(stop);
    vi.mocked(findMembership).mockRejectedValue(new Error("The database is slow"));

    await expect(followChanges("sam", { send: vi.fn(), close: vi.fn() })).rejects.toThrow(
      "The database is slow",
    );
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keeps listening when the stream starts", async () => {
    const stop = vi.fn();
    vi.mocked(watch).mockResolvedValue(stop);
    vi.mocked(findMembership).mockResolvedValue(null);

    const returned = await followChanges("sam", { send: vi.fn(), close: vi.fn() });
    expect(returned).toBe(stop);
    expect(stop).not.toHaveBeenCalled();
  });
});
