import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { anonymous, errorCode, householdWith, json, signUp, utcToday } from "./helpers.ts";

describe("deleting an account", () => {
  it("signs the person out for good and clears their session cookie", async () => {
    const person = await signUp();
    await json(await person.api.todos.$post({ json: { name: "Private thing" } }), 201);

    const deleted = await person.api.viewer.$delete();
    expect(deleted.status).toBe(204);
    expect(deleted.headers.getSetCookie().join("\n")).toMatch(
      /better-auth\.session_token=;.*Max-Age=0/,
    );

    // The old cookie no longer works
    expect(await json(await person.api.viewer.$get(), 200)).toEqual({
      user: null,
      household: null,
    });
    expect(await errorCode(await person.api.todos.$get(), 401)).toBe("UNAUTHORIZED");
    expect(await errorCode(await person.api.viewer.$delete(), 401)).toBe("UNAUTHORIZED");
  });

  it("hands the household to the earliest member and keeps what the person did in it", async () => {
    const owner = await signUp("Leaving Owner");
    const member = await signUp("Staying Member");
    await householdWith(owner, member);
    const { list } = await json(
      await owner.api.shopping.lists.$post({ json: { name: "Groceries" } }),
      201,
    );
    await json(
      await owner.api.shopping.lists[":listId"].items.$post({
        param: { listId: list.id },
        json: { name: "Oat milk" },
      }),
      201,
    );
    const { chore } = await json(
      await owner.api.chores.$post({
        json: { name: "Bins", repeat: null, dueOn: null, assigneeId: owner.id },
      }),
      201,
    );
    await json(
      await owner.api.chores[":choreId"].complete.$post({
        param: { choreId: chore.id },
        json: { today: utcToday().toString() },
      }),
      200,
    );

    expect((await owner.api.viewer.$delete()).status).toBe(204);

    const { household } = await json(await member.api.households.current.$get(), 200);
    expect(household.members.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: member.id, role: "owner" },
    ]);
    const { list: after } = await json(
      await member.api.shopping.lists[":listId"].$get({ param: { listId: list.id } }),
      200,
    );
    expect(after.items).toEqual([expect.objectContaining({ name: "Oat milk", addedBy: null })]);
    const { chore: kept } = await json(
      await member.api.chores[":choreId"].$get({ param: { choreId: chore.id } }),
      200,
    );
    expect(kept).toMatchObject({ name: "Bins", done: true, assignee: null });
    expect(kept.history).toEqual([expect.objectContaining({ completedBy: null })]);
  });

  it("deletes the household when they were the last one in it", async () => {
    const owner = await signUp();
    const { inviteCode } = await householdWith(owner);

    expect((await owner.api.viewer.$delete()).status).toBe(204);
    const visitor = await signUp();
    const preview = await visitor.api.households.invites[":code"].$get({
      param: { code: inviteCode },
    });
    expect(await errorCode(preview, 404)).toBe("INVITE_NOT_FOUND");
  });

  it("only happens when the person asks from the app itself", async () => {
    expect(await errorCode(await anonymous.viewer.$delete(), 401)).toBe("UNAUTHORIZED");

    const person = await signUp();
    const fromElsewhere = await app.request("/api/viewer", {
      method: "DELETE",
      headers: { cookie: person.cookie, origin: "http://evil.localhost:5173" },
    });
    expect(await errorCode(fromElsewhere, 403)).toBe("CROSS_ORIGIN_REQUEST");
    expect((await json(await person.api.viewer.$get(), 200)).user?.id).toBe(person.id);
  });
});
