import { describe, expect, it } from "vitest";

import { addInterval, couldBeToday } from "./chore-dates.ts";
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
  } = {},
) {
  const created = await person.api.chores.$post({
    json: {
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

describe("due date rules", () => {
  it("adds days and weeks to calendar dates, across daylight saving changes", () => {
    const date = Temporal.PlainDate.from("2026-03-28");
    expect(addInterval(date, 1, "day").toString()).toBe("2026-03-29");
    expect(addInterval(date, 2, "week").toString()).toBe("2026-04-11");
    expect(addInterval(Temporal.PlainDate.from("2026-12-30"), 3, "day").toString()).toBe(
      "2027-01-02",
    );
  });

  it("accepts as today only dates within a day of the UTC date", () => {
    const utc = Temporal.PlainDate.from("2026-11-01");
    expect(couldBeToday(Temporal.PlainDate.from("2026-10-31"), utc)).toBe(true);
    expect(couldBeToday(utc, utc)).toBe(true);
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-02"), utc)).toBe(true);
    expect(couldBeToday(Temporal.PlainDate.from("2026-11-03"), utc)).toBe(false);
    expect(couldBeToday(Temporal.PlainDate.from("2026-10-30"), utc)).toBe(false);
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

    const response = await complete(owner, chore.id, utcToday().subtract({ days: 3 }));
    expect(await errorCode(response, 400)).toBe("INVALID_TODAY");
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
      chores.$delete({ param }),
      complete(outsider, chore.id),
      chores.undo.$post({ param }),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(await errorCode(attempt, 404)).toBe("CHORE_NOT_FOUND");
    }
    expect((await json(await outsider.api.chores.$get(), 200)).chores).toEqual([]);
    expect((await json(await owner.api.chores.$get(), 200)).chores).toHaveLength(1);
  });
});
