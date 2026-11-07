import { describe, expect, it } from "vitest";

import { oneAtATime } from "./one-at-a-time.ts";

describe("oneAtATime", () => {
  it("runs work for one key in order, and other keys alongside it", async () => {
    const log: string[] = [];
    const step = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`end ${name}`);
      return name;
    };

    const results = await Promise.all([
      oneAtATime("a", step("a1", 20)),
      oneAtATime("a", step("a2", 1)),
      oneAtATime("b", step("b1", 1)),
    ]);

    expect(results).toEqual(["a1", "a2", "b1"]);
    expect(log.indexOf("start a2")).toBeGreaterThan(log.indexOf("end a1"));
    expect(log.indexOf("end b1")).toBeLessThan(log.indexOf("end a1"));
  });

  it("carries on with the next work when one fails", async () => {
    const failed = oneAtATime("c", async () => {
      throw new Error("nope");
    });
    const next = oneAtATime("c", async () => "next");

    await expect(failed).rejects.toThrow("nope");
    await expect(next).resolves.toBe("next");
  });
});
