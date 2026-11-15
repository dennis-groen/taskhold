import { describe, expect, it } from "vitest";

import { INVITE_CODE_PATTERN, extractInviteCode, formatInviteCode } from "./invite-code.ts";

describe("extractInviteCode", () => {
  it("reads a code however it was typed or pasted", () => {
    expect(extractInviteCode("fqvh-79zk")).toBe("FQVH79ZK");
    expect(extractInviteCode("FQVH 79ZK")).toBe("FQVH79ZK");
    expect(extractInviteCode("https://example.test/join/FQVH-79ZK?x=1")).toBe("FQVH79ZK");
  });

  it("drops characters codes never have and anything past the length", () => {
    expect(extractInviteCode("O0I1-fqvh")).toBe("FQVH");
    expect(extractInviteCode("FQVH79ZKABCD")).toBe("FQVH79ZK");
  });
});

describe("INVITE_CODE_PATTERN", () => {
  it("allows the code's characters in either case and nothing else", () => {
    const pattern = new RegExp(INVITE_CODE_PATTERN);
    expect(pattern.test("fqvh79ZK")).toBe(true);
    expect(pattern.test("FQVH0")).toBe(false);
    expect(pattern.test("FQVH-")).toBe(false);
  });
});

describe("formatInviteCode", () => {
  it("shows a code in two halves", () => {
    expect(formatInviteCode("FQVH79ZK")).toBe("FQVH-79ZK");
  });
});
