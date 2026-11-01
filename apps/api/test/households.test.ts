import { describe, expect, it } from "vitest";

import { errorCode, householdWith, json, signUp } from "./helpers.ts";

describe("creating and joining", () => {
  it("makes the creator the owner, and anyone with the code a member", async () => {
    const owner = await signUp("Owner");
    const member = await signUp("Member");
    await householdWith(owner, member);

    const { household } = await json(await member.api.households.current.$get(), 200);
    expect(household.members.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: owner.id, role: "owner" },
      { id: member.id, role: "member" },
    ]);
  });

  it("only lets a person be in one household", async () => {
    const owner = await signUp();
    const other = await signUp();
    const otherHome = await householdWith(other);
    await householdWith(owner);

    const create = await owner.api.households.$post({ json: { name: "Second home" } });
    expect(await errorCode(create, 409)).toBe("ALREADY_IN_HOUSEHOLD");
    const join = await owner.api.households.invites[":code"].accept.$post({
      param: { code: otherHome.inviteCode },
    });
    expect(await errorCode(join, 409)).toBe("ALREADY_IN_HOUSEHOLD");
  });

  it("accepts codes typed loosely, and previews who's in the household", async () => {
    const owner = await signUp("Robin Owner");
    const visitor = await signUp();
    const { inviteCode } = await householdWith(owner);

    const loose = `${inviteCode.slice(0, 4)}-${inviteCode.slice(4).toLowerCase()}`;
    const { invite } = await json(
      await visitor.api.households.invites[":code"].$get({ param: { code: loose } }),
      200,
    );
    expect(invite.householdName).toBe("Test home");
    expect(invite.members).toEqual([{ name: "Robin Owner", image: null }]);
  });
});

describe("guessing invite codes", () => {
  it("stops an account after 10 codes that match nothing, even for a real code", async () => {
    const owner = await signUp();
    const guesser = await signUp();
    const { inviteCode } = await householdWith(owner);

    for (let attempt = 0; attempt < 10; attempt++) {
      const miss = await guesser.api.households.invites[":code"].$get({
        param: { code: `ZZZZ${String(attempt).padStart(4, "Z")}` },
      });
      expect(await errorCode(miss, 404)).toBe("INVITE_NOT_FOUND");
    }

    const real = await guesser.api.households.invites[":code"].accept.$post({
      param: { code: inviteCode },
    });
    expect(await errorCode(real, 429)).toBe("TOO_MANY_INVITE_ATTEMPTS");

    // Only the guesser is stopped
    const someoneElse = await signUp();
    const joined = await someoneElse.api.households.invites[":code"].accept.$post({
      param: { code: inviteCode },
    });
    await json(joined, 200);
  });
});

describe("managing members", () => {
  it("lets the owner remove a member, and nobody else", async () => {
    const owner = await signUp();
    const member = await signUp();
    const other = await signUp();
    await householdWith(owner, member, other);

    const byMember = await member.api.households.current.members[":userId"].$delete({
      param: { userId: other.id },
    });
    expect(await errorCode(byMember, 403)).toBe("OWNER_ONLY");

    const byOwner = await owner.api.households.current.members[":userId"].$delete({
      param: { userId: member.id },
    });
    const { household } = await json(byOwner, 200);
    expect(household.members.map((person) => person.id)).toEqual([owner.id, other.id]);
    expect(await errorCode(await member.api.households.current.$get(), 404)).toBe(
      "NOT_IN_HOUSEHOLD",
    );
  });

  it("can't remove someone from another household", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    await householdWith(owner);
    await householdWith(stranger);

    const response = await owner.api.households.current.members[":userId"].$delete({
      param: { userId: stranger.id },
    });
    expect(await errorCode(response, 404)).toBe("MEMBER_NOT_FOUND");
  });

  it("hands ownership to the earliest member when the owner leaves", async () => {
    const owner = await signUp();
    const first = await signUp();
    const second = await signUp();
    await householdWith(owner, first, second);

    const left = await owner.api.households.current.leave.$post();
    expect(await json(left, 200)).toEqual({ householdDeleted: false });

    const { household } = await json(await first.api.households.current.$get(), 200);
    expect(household.members.find((person) => person.role === "owner")?.id).toBe(first.id);
  });

  it("deletes the household when the last person leaves", async () => {
    const owner = await signUp();
    const { inviteCode } = await householdWith(owner);

    expect(await json(await owner.api.households.current.leave.$post(), 200)).toEqual({
      householdDeleted: true,
    });
    const visitor = await signUp();
    const preview = await visitor.api.households.invites[":code"].$get({
      param: { code: inviteCode },
    });
    expect(await errorCode(preview, 404)).toBe("INVITE_NOT_FOUND");
  });

  it("stops the old invite code working once the owner makes a new one", async () => {
    const owner = await signUp();
    const late = await signUp();
    const { inviteCode: oldCode } = await householdWith(owner);

    const { household } = await json(
      await owner.api.households.current["invite-code"].$post(),
      200,
    );
    expect(household.inviteCode).not.toBe(oldCode);

    const withOld = await late.api.households.invites[":code"].accept.$post({
      param: { code: oldCode },
    });
    expect(await errorCode(withOld, 404)).toBe("INVITE_NOT_FOUND");
  });
});
