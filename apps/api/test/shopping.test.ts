import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { errorCode, householdWith, json, signUp, type TestUser } from "./helpers.ts";

async function listOf(person: TestUser, name = "Groceries") {
  const { list } = await json(await person.api.shopping.lists.$post({ json: { name } }), 201);
  return list;
}

describe("shopping lists", () => {
  it("are shared by everyone in the household", async () => {
    const owner = await signUp("Owner");
    const member = await signUp("Member");
    await householdWith(owner, member);
    const list = await listOf(owner);

    const added = await member.api.shopping.lists[":listId"].items.$post({
      param: { listId: list.id },
      json: { name: "Oat milk", quantity: "2" },
    });
    const { item } = await json(added, 201);
    expect(item).toMatchObject({ name: "Oat milk", quantity: "2", checked: false });
    expect(item.addedBy).toEqual({ id: member.id, name: "Member" });

    const checked = await owner.api.shopping.lists[":listId"].items[":itemId"].$patch({
      param: { listId: list.id, itemId: item.id },
      json: { checked: true },
    });
    const { item: after } = await json(checked, 200);
    expect(after.checked).toBe(true);
    expect(after.checkedBy).toEqual({ id: owner.id, name: "Owner" });
    expect(Temporal.Instant.from(after.checkedAt ?? "")).toBeInstanceOf(Temporal.Instant);

    const { lists } = await json(await member.api.shopping.lists.$get(), 200);
    expect(lists).toEqual([{ id: list.id, name: "Groceries", itemCount: 1, openCount: 0 }]);
  });

  it("look missing to other households, for every action", async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await householdWith(owner);
    await householdWith(outsider);
    const list = await listOf(owner);
    const { item } = await json(
      await owner.api.shopping.lists[":listId"].items.$post({
        param: { listId: list.id },
        json: { name: "Bread" },
      }),
      201,
    );

    const lists = outsider.api.shopping.lists[":listId"];
    const param = { listId: list.id };
    const itemParam = { ...param, itemId: item.id };
    const attempts = [
      lists.$get({ param }),
      lists.$patch({ param, json: { name: "Mine now" } }),
      lists.$delete({ param }),
      lists.items.$post({ param, json: { name: "Sneaky" } }),
      lists.items[":itemId"].$patch({ param: itemParam, json: { checked: true } }),
      lists.items[":itemId"].$delete({ param: itemParam }),
      lists["clear-checked"].$post({ param }),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(await errorCode(attempt, 404)).toBe("LIST_NOT_FOUND");
    }
    expect((await json(await outsider.api.shopping.lists.$get(), 200)).lists).toEqual([]);

    // Nothing changed for the owner
    const { list: unchanged } = await json(
      await owner.api.shopping.lists[":listId"].$get({ param }),
      200,
    );
    expect(unchanged).toMatchObject({
      name: "Groceries",
      items: [{ name: "Bread", checked: false }],
    });
  });

  it("add an item once when the same add is retried with its id", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await listOf(owner);
    const id = randomUUID();
    const add = () =>
      owner.api.shopping.lists[":listId"].items.$post({
        param: { listId: list.id },
        json: { id, name: "Eggs" },
      });

    await json(await add(), 201);
    await json(await add(), 201);
    const { list: after } = await json(
      await owner.api.shopping.lists[":listId"].$get({ param: { listId: list.id } }),
      200,
    );
    expect(after.items.map((item) => item.id)).toEqual([id]);
  });

  it("clear only the checked items", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await listOf(owner);
    const items = owner.api.shopping.lists[":listId"].items;
    const param = { listId: list.id };
    const { item: bought } = await json(
      await items.$post({ param, json: { name: "Apples" } }),
      201,
    );
    await json(await items.$post({ param, json: { name: "Pears" } }), 201);
    await json(
      await items[":itemId"].$patch({
        param: { ...param, itemId: bought.id },
        json: { checked: true },
      }),
      200,
    );

    const cleared = await owner.api.shopping.lists[":listId"]["clear-checked"].$post({ param });
    expect(await json(cleared, 200)).toEqual({ removed: 1 });
    const { list: after } = await json(
      await owner.api.shopping.lists[":listId"].$get({ param }),
      200,
    );
    expect(after.items.map((item) => item.name)).toEqual(["Pears"]);
  });
});
