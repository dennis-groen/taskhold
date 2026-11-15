import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { db } from "../../db/db.ts";
import { couldBeToday } from "./client-today.ts";
import { chore as choreTable } from "./chores.table.ts";
import {
  errorCode,
  householdWith,
  json,
  signUp,
  utcToday,
  type TestUser,
} from "../../../test/harness.ts";

const weekly = { every: 1, unit: "week" } as const;

async function choreOf(
  person: TestUser,
  chore: {
    name?: string;
    repeat?: { every: number; unit: "day" | "week" } | null;
    dueOn?: string | null;
    assigneeId?: string | null;
    id?: string;
  } = {},
) {
  const created = await person.api.chores.$post({
    json: {
      ...(chore.id && { id: chore.id }),
      name: chore.name ?? "Vacuum",
      repeat: chore.repeat === undefined ? weekly : chore.repeat,
      dueOn: chore.dueOn === undefined ? utcToday().toString() : chore.dueOn,
      assigneeId: chore.assigneeId ?? null,
    },
  });
  return (await json(created, 201)).chore;
}

function complete(person: TestUser, choreId: string, today = utcToday()) {
  return person.api.chores[":choreId"].complete.$post({
    param: { choreId },
    json: { today: today.toString() },
  });
}

function skip(person: TestUser, choreId: string, today = utcToday()) {
  return person.api.chores[":choreId"].skip.$post({
    param: { choreId },
    json: { today: today.toString() },
  });
}

// What marking done and skipping do to a due date is tested in chore-schedule.test.ts
describe("today from the client", () => {
  it("accepts dates within a day of the UTC date", () => {
    const utc = Temporal.PlainDate.from("2026-11-10");
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-09"), utc)).toBe(true);
    expect(couldBeToday(utc, utc)).toBe(true);
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-11"), utc)).toBe(true);
  });

  it("accepts the day of a tap that waited on a device for up to a week", () => {
    const utc = Temporal.PlainDate.from("2026-11-10");
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-07"), utc)).toBe(true);
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-02"), utc)).toBe(true);
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-01"), utc)).toBe(false);
  });

  it("refuses dates after tomorrow", () => {
    const utc = Temporal.PlainDate.from("2026-11-10");
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-12"), utc)).toBe(false);
  });
});

describe("completing chores", () => {
  it("counts the next due date from the day it was done, not from when it was due", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const overdue = utcToday().subtract({ days: 5 });
    const chore = await choreOf(owner, {
      dueOn: overdue.toString(),
      repeat: { every: 2, unit: "week" },
    });

    const { chore: done } = await json(await complete(owner, chore.id), 200);
    expect(done.dueOn).toBe(utcToday().add({ weeks: 2 }).toString());
    expect(done.lastCompletion?.completedOn).toBe(utcToday().toString());
    expect(done.lastCompletion?.completedBy?.id).toBe(owner.id);
  });

  it("counts a second completion on the same day once, whoever does it", async () => {
    const owner = await signUp();
    const member = await signUp();
    await householdWith(owner, member);
    const chore = await choreOf(owner);

    await json(await complete(owner, chore.id), 200);
    const { chore: again } = await json(await complete(member, chore.id), 200);
    expect(again.history).toHaveLength(1);
    expect(again.dueOn).toBe(utcToday().add({ weeks: 1 }).toString());
  });

  it("marks a one-off chore done without changing its date", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner, { repeat: null, dueOn: null });

    const { chore: done } = await json(await complete(owner, chore.id), 200);
    expect(done).toMatchObject({ done: true, dueOn: null, repeat: null });
  });

  it("refuses a 'today' that can't be today anywhere", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);

    const response = await complete(owner, chore.id, utcToday().subtract({ days: 9 }));
    expect(await errorCode(response, 400)).toBe("INVALID_TODAY");
  });

  it("counts a chore done offline from the day of the tap, when it arrives days later", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);
    const tapped = utcToday().subtract({ days: 2 });

    const { chore: done } = await json(await complete(owner, chore.id, tapped), 200);
    expect(done.dueOn).toBe(tapped.add({ weeks: 1 }).toString());
    expect(done.lastCompletion?.completedOn).toBe(tapped.toString());
  });

  it("undoes the latest completion, putting the due date back", async () => {
    const owner = await signUp();
    const member = await signUp();
    await householdWith(owner, member);
    const due = utcToday().subtract({ days: 2 }).toString();
    const chore = await choreOf(owner, { dueOn: due });
    await json(await complete(owner, chore.id), 200);

    // Anyone in the household can undo
    const undo = () => member.api.chores[":choreId"].undo.$post({ param: { choreId: chore.id } });
    const { chore: undone } = await json(await undo(), 200);
    expect(undone).toMatchObject({ dueOn: due, lastCompletion: null, history: [] });
    expect(await errorCode(await undo(), 409)).toBe("NOTHING_TO_UNDO");
  });
});

describe("skipping chores", () => {
  it("moves the date on and keeps the skip in the history, without counting it as done", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner, { dueOn: utcToday().subtract({ days: 3 }).toString() });

    const { chore: skipped } = await json(await skip(owner, chore.id), 200);
    expect(skipped.dueOn).toBe(utcToday().add({ weeks: 1 }).toString());
    expect(skipped.done).toBe(false);
    expect(skipped.history).toHaveLength(1);
    expect(skipped.history[0]).toMatchObject({
      skipped: true,
      completedOn: utcToday().toString(),
      completedBy: { id: owner.id },
    });
  });

  it("counts a second skip on the same day once", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);

    await json(await skip(owner, chore.id), 200);
    const { chore: again } = await json(await skip(owner, chore.id), 200);
    expect(again.history).toHaveLength(1);
    expect(again.dueOn).toBe(utcToday().add({ weeks: 1 }).toString());
  });

  it("still lets someone do it after skipping it earlier the same day", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);

    await json(await skip(owner, chore.id), 200);
    const { chore: done } = await json(await complete(owner, chore.id), 200);
    expect(done.history.map((entry) => entry.skipped)).toEqual([false, true]);
    expect(done.dueOn).toBe(utcToday().add({ weeks: 1 }).toString());
  });

  it("puts the date back on undo", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const due = utcToday().subtract({ days: 2 }).toString();
    const chore = await choreOf(owner, { dueOn: due });
    await json(await skip(owner, chore.id), 200);

    const undo = owner.api.chores[":choreId"].undo.$post({ param: { choreId: chore.id } });
    const { chore: undone } = await json(await undo, 200);
    expect(undone).toMatchObject({ dueOn: due, lastCompletion: null, history: [] });
  });

  it("isn't done, or cleared, once a skipped chore stops repeating", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);
    await json(await skip(owner, chore.id), 200);

    const update = owner.api.chores[":choreId"].$patch({
      param: { choreId: chore.id },
      json: { repeat: null },
    });
    expect((await json(await update, 200)).chore.done).toBe(false);
    expect(await json(await owner.api.chores["clear-done"].$post(), 200)).toEqual({ removed: 0 });
  });

  it("only skips repeating chores", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner, { repeat: null, dueOn: utcToday().toString() });

    expect(await errorCode(await skip(owner, chore.id), 400)).toBe("CHORE_NOT_REPEATING");
  });

  it("refuses a 'today' that can't be today anywhere", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);

    const response = await skip(owner, chore.id, utcToday().add({ days: 3 }));
    expect(await errorCode(response, 400)).toBe("INVALID_TODAY");
  });
});

describe("chore rules", () => {
  it("needs a due date for a repeating chore", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const response = await owner.api.chores.$post({
      json: { name: "Mop", repeat: weekly, dueOn: null, assigneeId: null },
    });
    expect(await errorCode(response, 400)).toBe("DUE_DATE_REQUIRED");

    const chore = await choreOf(owner, { repeat: null, dueOn: null });
    const update = await owner.api.chores[":choreId"].$patch({
      param: { choreId: chore.id },
      json: { repeat: weekly },
    });
    expect(await errorCode(update, 400)).toBe("DUE_DATE_REQUIRED");
  });

  it("only assigns chores to people in the household", async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await householdWith(owner);
    await householdWith(outsider);

    const response = await owner.api.chores.$post({
      json: { name: "Mop", repeat: null, dueOn: null, assigneeId: outsider.id },
    });
    expect(await errorCode(response, 400)).toBe("ASSIGNEE_NOT_MEMBER");
  });

  it("shows a chore as unassigned once its assignee leaves", async () => {
    const owner = await signUp();
    const member = await signUp("Leaving Member");
    await householdWith(owner, member);
    const chore = await choreOf(owner, { assigneeId: member.id });
    expect(chore.assignee).toEqual({ id: member.id, name: "Leaving Member", image: null });

    await json(await member.api.households.current.leave.$post(), 200);
    const { chore: after } = await json(
      await owner.api.chores[":choreId"].$get({ param: { choreId: chore.id } }),
      200,
    );
    expect(after.assignee).toBeNull();
  });

  it("clears done one-off chores and leaves the rest", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const oneOff = await choreOf(owner, { name: "Fix tap", repeat: null, dueOn: null });
    const repeating = await choreOf(owner, { name: "Bins" });
    await json(await complete(owner, oneOff.id), 200);
    await json(await complete(owner, repeating.id), 200);

    expect(await json(await owner.api.chores["clear-done"].$post(), 200)).toEqual({ removed: 1 });
    const { chores } = await json(await owner.api.chores.$get(), 200);
    expect(chores.map((chore) => chore.name)).toEqual(["Bins"]);
  });

  it("starts a chore that stops repeating as not done, with no history", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner, { name: "Windows" });
    await json(await complete(owner, chore.id), 200);

    const { chore: oneOff } = await json(
      await owner.api.chores[":choreId"].$patch({
        param: { choreId: chore.id },
        json: { repeat: null },
      }),
      200,
    );
    expect(oneOff).toMatchObject({ repeat: null, done: false, lastCompletion: null, history: [] });

    // Not done, so "Clear done" leaves it
    expect(await json(await owner.api.chores["clear-done"].$post(), 200)).toEqual({ removed: 0 });
    const { chores } = await json(await owner.api.chores.$get(), 200);
    expect(chores.map((item) => item.name)).toEqual(["Windows"]);
  });

  it("keeps the history when an edit leaves the repeat alone", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner, { name: "Windows" });
    await json(await complete(owner, chore.id), 200);

    const { chore: renamed } = await json(
      await owner.api.chores[":choreId"].$patch({
        param: { choreId: chore.id },
        json: { name: "All windows" },
      }),
      200,
    );
    expect(renamed.history).toHaveLength(1);
  });

  it("can be deleted by a member, history included", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);
    await json(await complete(owner, chore.id), 200);
    const param = { choreId: chore.id };

    expect((await owner.api.chores[":choreId"].$delete({ param })).status).toBe(204);
    expect(await errorCode(await owner.api.chores[":choreId"].$get({ param }), 404)).toBe(
      "CHORE_NOT_FOUND",
    );
    expect((await json(await owner.api.chores.$get(), 200)).chores).toEqual([]);
  });

  it("are only cleared for the household that asked", async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await householdWith(owner);
    await householdWith(outsider);
    const done = await choreOf(owner, { name: "Fix tap", repeat: null, dueOn: null });
    await json(await complete(owner, done.id), 200);

    expect(await json(await outsider.api.chores["clear-done"].$post(), 200)).toEqual({
      removed: 0,
    });
    const { chores } = await json(await owner.api.chores.$get(), 200);
    expect(chores.map((chore) => chore.name)).toEqual(["Fix tap"]);
  });

  it("look missing to other households, for every action", async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await householdWith(owner);
    await householdWith(outsider);
    const chore = await choreOf(owner);

    const chores = outsider.api.chores[":choreId"];
    const param = { choreId: chore.id };
    const attempts = [
      chores.$get({ param }),
      chores.$patch({ param, json: { name: "Mine now" } }),
      complete(outsider, chore.id),
      skip(outsider, chore.id),
      chores.undo.$post({ param }),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(await errorCode(attempt, 404)).toBe("CHORE_NOT_FOUND");
    }
    // Deleting another household's chore does nothing, like deleting one that's already gone
    expect((await chores.$delete({ param })).status).toBe(204);
    expect((await json(await outsider.api.chores.$get(), 200)).chores).toEqual([]);
    expect((await json(await owner.api.chores.$get(), 200)).chores).toHaveLength(1);
  });

  it("answers the same when a chore is deleted twice, or never existed", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const chore = await choreOf(owner);
    const param = { choreId: chore.id };

    expect((await owner.api.chores[":choreId"].$delete({ param })).status).toBe(204);
    expect((await owner.api.chores[":choreId"].$delete({ param })).status).toBe(204);
    expect(
      (await owner.api.chores[":choreId"].$delete({ param: { choreId: randomUUID() } })).status,
    ).toBe(204);
  });
});

describe("choosing the id", () => {
  it("makes the chore with the id it was given, once however many times it's sent", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const id = randomUUID();

    const first = await choreOf(owner, { id, name: "Bins" });
    expect(first.id).toBe(id);
    const again = await choreOf(owner, { id, name: "Bins" });
    expect(again.id).toBe(id);
    expect((await json(await owner.api.chores.$get(), 200)).chores).toHaveLength(1);
  });

  it("can't take over another household's chore by reusing its id", async () => {
    const owner = await signUp();
    const other = await signUp();
    await householdWith(owner);
    await householdWith(other);
    const id = randomUUID();
    await choreOf(owner, { id, name: "Mine" });

    const reuse = await other.api.chores.$post({
      json: { id, name: "Overwritten", repeat: null, dueOn: null, assigneeId: null },
    });
    expect(await errorCode(reuse, 409)).toBe("CHORE_ID_TAKEN");
    const { chores } = await json(await owner.api.chores.$get(), 200);
    expect(chores.map((chore) => chore.name)).toEqual(["Mine"]);
    expect((await json(await other.api.chores.$get(), 200)).chores).toEqual([]);
  });

  it("still accepts a retry of an add that got in when the household is at its limit", async () => {
    const owner = await signUp();
    const household = await householdWith(owner);
    const id = randomUUID();
    await choreOf(owner, { id, name: "The 200th" });
    await db
      .insert(choreTable)
      .values(
        Array.from({ length: 199 }, (_, n) => ({ householdId: household.id, name: `Chore ${n}` })),
      );

    const retry = await owner.api.chores.$post({
      json: { id, name: "The 200th", repeat: null, dueOn: null, assigneeId: null },
    });
    expect(retry.status).toBe(201);
    const oneMore = await owner.api.chores.$post({
      json: { name: "One more", repeat: null, dueOn: null, assigneeId: null },
    });
    expect(await errorCode(oneMore, 409)).toBe("CHORE_LIMIT_REACHED");
  });
});

describe("limits", () => {
  it("stop a household at 200 chores", async () => {
    const owner = await signUp();
    const household = await householdWith(owner);
    await db
      .insert(choreTable)
      .values(
        Array.from({ length: 200 }, (_, n) => ({ householdId: household.id, name: `Chore ${n}` })),
      );

    const oneMore = await owner.api.chores.$post({
      json: { name: "One more", repeat: null, dueOn: null, assigneeId: null },
    });
    expect(await errorCode(oneMore, 409)).toBe("CHORE_LIMIT_REACHED");
  });
});
