import { describe, expect, it } from "vitest";

import { safeRedirect } from "./redirect.ts";

describe("the page to return to after sign-in", () => {
  it("accepts paths on this site", () => {
    expect(safeRedirect("/lists")).toBe("/lists");
    expect(safeRedirect("/join/FQVH-79ZK?x=1#top")).toBe("/join/FQVH-79ZK?x=1#top");
    expect(safeRedirect("/")).toBe("/");
  });

  it("refuses anything that could leave the site", () => {
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", ""]) {
      expect(safeRedirect(value)).toBeUndefined();
    }
    expect(safeRedirect(undefined)).toBeUndefined();
    expect(safeRedirect(42)).toBeUndefined();
  });
});
