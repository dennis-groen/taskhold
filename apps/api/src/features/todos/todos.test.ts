import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { errorCode, householdWith, json, signUp, type TestUser } from "../../../test/harness.ts";

async function todoOf(
  person: TestUser,
  todo: { name?: string; notes?: string | null; dueOn?: string | null } = {},
) {
  const created = await person.api.todos.$post({
    json: { name: todo.name ?? "Call the dentist", notes: todo.notes, dueOn: todo.dueOn },
  });
  return (await json(created, 201)).todo;
}

describe("private to-dos", () => {
  it("are invisible to everyone else, including the rest of the household", async () => {
    const owner = await signUp();
    const housemate = await signUp();
    await householdWith(owner, housemate);
    const todo = await todoOf(owner, { notes: "Ask about the crown" });

    const todos = housemate.api.todos[":todoId"];
    const param = { todoId: todo.id };
    for (const attempt of await Promise.all([
      todos.$patch({ param, json: { done: true } }),
      todos["move-to-chores"].$post({ param }),
    ])) {
      expect(await errorCode(attempt, 404)).toBe("TODO_NOT_FOUND");
    }
    // Deleting someone else's to-do does nothing, like deleting one that's already gone
    expect((await todos.$delete({ param })).status).toBe(204);
    expect((await json(await housemate.api.todos.$get(), 200)).todos).toEqual([]);
    await json(await housemate.api.todos["clear-done"].$post(), 200);

    const { todos: mine } = await json(await owner.api.todos.$get(), 200);
    expect(mine).toEqual([
      expect.objectContaining({ id: todo.id, notes: "Ask about the crown", done: false }),
    ]);
  });

  it("can't take over someone else's to-do by reusing its id", async () => {
    const owner = await signUp();
    const other = await signUp();
    const id = randomUUID();
    await json(await owner.api.todos.$post({ json: { id, name: "Mine" } }), 201);

    const reuse = await other.api.todos.$post({ json: { id, name: "Overwritten" } });
    expect(await errorCode(reuse, 409)).toBe("TODO_ID_TAKEN");
    const { todos } = await json(await owner.api.todos.$get(), 200);
    expect(todos.map((todo) => todo.name)).toEqual(["Mine"]);
  });

  it("add once when the same add is retried with its id", async () => {
    const owner = await signUp();
    const id = randomUUID();
    await json(await owner.api.todos.$post({ json: { id, name: "Renew passport" } }), 201);
    await json(await owner.api.todos.$post({ json: { id, name: "Renew passport" } }), 201);
    expect((await json(await owner.api.todos.$get(), 200)).todos).toHaveLength(1);
  });

  it("work without a household, and stay with the person when they leave one", async () => {
    const owner = await signUp();
    const member = await signUp();
    await todoOf(member, { name: "Before joining" });
    await householdWith(owner, member);
    await todoOf(member, { name: "While in a household" });

    await json(await member.api.households.current.leave.$post(), 200);
    const { todos } = await json(await member.api.todos.$get(), 200);
    expect(todos.map((todo) => todo.name).toSorted()).toEqual([
      "Before joining",
      "While in a household",
    ]);
  });

  it("are marked done and undone, and done ones can be cleared", async () => {
    const owner = await signUp();
    const done = await todoOf(owner, { name: "Done" });
    await todoOf(owner, { name: "Open" });
    const todos = owner.api.todos[":todoId"];

    const { todo: marked } = await json(
      await todos.$patch({ param: { todoId: done.id }, json: { done: true } }),
      200,
    );
    expect(marked.done).toBe(true);
    expect(marked.doneAt).not.toBeNull();
    const { todo: unmarked } = await json(
      await todos.$patch({ param: { todoId: done.id }, json: { done: false } }),
      200,
    );
    expect(unmarked).toMatchObject({ done: false, doneAt: null });

    await json(await todos.$patch({ param: { todoId: done.id }, json: { done: true } }), 200);
    expect(await json(await owner.api.todos["clear-done"].$post(), 200)).toEqual({ removed: 1 });
    expect((await json(await owner.api.todos.$get(), 200)).todos.map((todo) => todo.name)).toEqual([
      "Open",
    ]);
  });
});

describe("moving a to-do to the household's chores", () => {
  it("makes a one-off chore with the name and due date, and drops the private notes", async () => {
    const owner = await signUp();
    const housemate = await signUp();
    await householdWith(owner, housemate);
    const todo = await todoOf(owner, {
      name: "Book flights",
      notes: "Private detail",
      dueOn: "2026-12-01",
    });

    const moved = await owner.api.todos[":todoId"]["move-to-chores"].$post({
      param: { todoId: todo.id },
    });
    const { chore } = await json(moved, 201);
    expect(chore).toMatchObject({
      name: "Book flights",
      dueOn: "2026-12-01",
      repeat: null,
      assignee: null,
    });
    expect(JSON.stringify(chore)).not.toContain("Private detail");

    expect((await json(await owner.api.todos.$get(), 200)).todos).toEqual([]);
    const { chores } = await json(await housemate.api.chores.$get(), 200);
    expect(chores.map((item) => item.name)).toEqual(["Book flights"]);

    // Moving it again finds nothing
    const again = await owner.api.todos[":todoId"]["move-to-chores"].$post({
      param: { todoId: todo.id },
    });
    expect(await errorCode(again, 404)).toBe("TODO_NOT_FOUND");
  });

  it("keeps the to-do when there's no household to move it to", async () => {
    const loner = await signUp();
    const todo = await todoOf(loner);

    const moved = await loner.api.todos[":todoId"]["move-to-chores"].$post({
      param: { todoId: todo.id },
    });
    expect(await errorCode(moved, 404)).toBe("NOT_IN_HOUSEHOLD");
    expect((await json(await loner.api.todos.$get(), 200)).todos).toHaveLength(1);
  });
});
