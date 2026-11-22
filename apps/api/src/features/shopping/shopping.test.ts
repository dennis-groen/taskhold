import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../../db/db.ts";
import { shoppingItem, shoppingList, shoppingPurchase } from "./shopping.table.ts";
import { errorCode, householdWith, json, signUp, type TestUser } from "../../../test/harness.ts";

async function listOf(person: TestUser, name = "Groceries") {
  const { list } = await json(await person.api.shopping.lists.$post({ json: { name } }), 201);
  return list;
}

describe("shopping lists", () => {
  it("can be renamed and deleted by a member, items included", async () => {
    const owner = await signUp();
    const member = await signUp();
    await householdWith(owner, member);
    const list = await listOf(owner);
    const lists = member.api.shopping.lists[":listId"];
    const param = { listId: list.id };
    const { item } = await json(await lists.items.$post({ param, json: { name: "Bread" } }), 201);

    expect((await lists.$patch({ param, json: { name: "Market" } })).status).toBe(204);
    expect(
      (await json(await owner.api.shopping.lists[":listId"].$get({ param }), 200)).list.name,
    ).toBe("Market");

    const removed = await lists.items[":itemId"].$delete({ param: { ...param, itemId: item.id } });
    expect(removed.status).toBe(204);
    expect((await json(await lists.$get({ param }), 200)).list.items).toEqual([]);

    expect((await lists.$delete({ param })).status).toBe(204);
    expect(await errorCode(await lists.$get({ param }), 404)).toBe("LIST_NOT_FOUND");
    expect((await json(await owner.api.shopping.lists.$get(), 200)).lists).toEqual([]);
  });

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
      lists.items.$post({ param, json: { name: "Sneaky" } }),
      lists.items[":itemId"].$patch({ param: itemParam, json: { checked: true } }),
      lists.items[":itemId"].$delete({ param: itemParam }),
      lists["clear-checked"].$post({ param }),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(await errorCode(attempt, 404)).toBe("LIST_NOT_FOUND");
    }
    // Deleting another household's list does nothing, like deleting one that's already gone
    expect((await lists.$delete({ param })).status).toBe(204);
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

  it("answer the same when a list is deleted twice, or never existed", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await listOf(owner);
    const lists = owner.api.shopping.lists[":listId"];

    expect((await lists.$delete({ param: { listId: list.id } })).status).toBe(204);
    expect((await lists.$delete({ param: { listId: list.id } })).status).toBe(204);
    expect((await lists.$delete({ param: { listId: randomUUID() } })).status).toBe(204);
  });

  it("are made once with the id they were given, however many times it's sent", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const id = randomUUID();
    const create = () => owner.api.shopping.lists.$post({ json: { id, name: "Market" } });

    const { list: first } = await json(await create(), 201);
    expect(first).toEqual({ id, name: "Market", items: [] });
    await owner.api.shopping.lists[":listId"].items.$post({
      param: { listId: id },
      json: { name: "Bread" },
    });

    // A retry answers with the list as it is now
    const { list: again } = await json(await create(), 201);
    expect(again).toMatchObject({ id, name: "Market", items: [{ name: "Bread" }] });
    expect((await json(await owner.api.shopping.lists.$get(), 200)).lists).toHaveLength(1);

    const invalid = await owner.api.shopping.lists.$post({ json: { id: "nope", name: "Market" } });
    expect(await errorCode(invalid, 400)).toBe("INVALID_REQUEST");
  });

  it("can't take over another household's list by reusing its id", async () => {
    const owner = await signUp();
    const other = await signUp();
    await householdWith(owner);
    await householdWith(other);
    const id = randomUUID();
    await json(await owner.api.shopping.lists.$post({ json: { id, name: "Mine" } }), 201);

    const reuse = await other.api.shopping.lists.$post({ json: { id, name: "Overwritten" } });
    expect(await errorCode(reuse, 409)).toBe("LIST_ID_TAKEN");
    const { lists } = await json(await owner.api.shopping.lists.$get(), 200);
    expect(lists.map((list) => list.name)).toEqual(["Mine"]);
    expect((await json(await other.api.shopping.lists.$get(), 200)).lists).toEqual([]);
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

  it("let anyone in the household fix an item's name and quantity", async () => {
    const owner = await signUp("Owner");
    const member = await signUp("Member");
    await householdWith(owner, member);
    const list = await listOf(owner);
    const { item } = await json(
      await owner.api.shopping.lists[":listId"].items.$post({
        param: { listId: list.id },
        json: { name: "Bred" },
      }),
      201,
    );
    const edit = (changes: { name?: string; quantity?: string | null }) =>
      member.api.shopping.lists[":listId"].items[":itemId"].$patch({
        param: { listId: list.id, itemId: item.id },
        json: changes,
      });

    const { item: fixed } = await json(await edit({ name: " Bread ", quantity: " 2 " }), 200);
    expect(fixed).toMatchObject({ id: item.id, name: "Bread", quantity: "2", checked: false });
    // Still credited to whoever added it
    expect(fixed.addedBy).toEqual({ id: owner.id, name: "Owner" });

    // Only what's sent changes, and a blank or null quantity clears it
    expect((await json(await edit({ quantity: "" }), 200)).item).toMatchObject({
      name: "Bread",
      quantity: null,
    });
    await json(await edit({ quantity: "500 g" }), 200);
    expect((await json(await edit({ quantity: null }), 200)).item.quantity).toBeNull();

    expect(await errorCode(await edit({ name: "  " }), 400)).toBe("INVALID_REQUEST");
    expect(await errorCode(await edit({ quantity: "x".repeat(21) }), 400)).toBe("INVALID_REQUEST");
    expect(await errorCode(await edit({}), 400)).toBe("INVALID_REQUEST");
  });

  it("say an item is gone when someone removed it before the edit arrived", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await listOf(owner);
    const param = { listId: list.id, itemId: randomUUID() };
    const edited = await owner.api.shopping.lists[":listId"].items[":itemId"].$patch({
      param,
      json: { quantity: "2" },
    });
    expect(await errorCode(edited, 404)).toBe("ITEM_NOT_FOUND");
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

/** A fresh list for the person, with shorthand for adding, ticking, renaming and clearing */
async function shop(person: TestUser, name = "Groceries") {
  const list = await listOf(person, name);
  const items = person.api.shopping.lists[":listId"].items;
  return {
    id: list.id,
    add: async (itemName: string, id: string = randomUUID(), quantity?: string) =>
      (
        await json(
          await items.$post({
            param: { listId: list.id },
            json: { id, name: itemName, ...(quantity !== undefined && { quantity }) },
          }),
          201,
        )
      ).item,
    patch: (
      itemId: string,
      change: { name?: string; quantity?: string | null; checked?: boolean },
    ) => items[":itemId"].$patch({ param: { listId: list.id, itemId }, json: change }),
    clear: () =>
      person.api.shopping.lists[":listId"]["clear-checked"].$post({ param: { listId: list.id } }),
    removeList: () => person.api.shopping.lists[":listId"].$delete({ param: { listId: list.id } }),
  };
}

async function historyOf(person: TestUser) {
  return (await json(await person.api.shopping.history.$get(), 200)).items;
}

describe("buy again history", () => {
  it("records what's ticked off, and outlives the cart", async () => {
    const owner = await signUp();
    const member = await signUp();
    await householdWith(owner, member);
    const list = await shop(owner);

    const milk = await list.add("Milk", undefined, "2");
    await list.add("Bread");
    expect(await historyOf(owner)).toEqual([]);

    await json(await list.patch(milk.id, { checked: true }), 200);
    await json(await list.clear(), 200);

    const history = await historyOf(member);
    expect(history).toEqual([
      {
        name: "Milk",
        quantity: "2",
        trips: 1,
        firstBoughtAt: expect.any(String),
        lastBoughtAt: expect.any(String),
        listIds: [list.id],
        pairedWith: [],
      },
    ]);
  });

  it("takes a purchase back when the item is unticked, and follows name and quantity edits", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await shop(owner);
    const item = await list.add("Mlik", undefined, "2");

    await json(await list.patch(item.id, { checked: true }), 200);
    await json(await list.patch(item.id, { name: "Milk", quantity: "3" }), 200);
    expect(await historyOf(owner)).toMatchObject([{ name: "Milk", quantity: "3" }]);

    await json(await list.patch(item.id, { checked: false }), 200);
    expect(await historyOf(owner)).toEqual([]);
  });

  it("returns the most common quantity and tracks which lists an item was bought on", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const groceries = await shop(owner, "Groceries");
    const market = await shop(owner, "Market");

    const buy = async (
      target: Awaited<ReturnType<typeof shop>>,
      name: string,
      quantity?: string,
    ) => {
      const item = await target.add(name, undefined, quantity);
      await json(await target.patch(item.id, { checked: true }), 200);
    };

    // Milk: bought twice with "2" and once without quantity -> usual quantity is "2"
    await buy(groceries, "Milk", "2");
    await buy(groceries, "Milk", "2");
    await buy(market, "Milk");

    // Bread: bought twice without quantity and once with "2" -> usual quantity is null
    await buy(groceries, "Bread");
    await buy(groceries, "Bread");
    await buy(groceries, "Bread", "2");

    const history = await historyOf(owner);
    const milk = history.find((entry) => entry.name === "Milk");
    const bread = history.find((entry) => entry.name === "Bread");
    expect(milk?.quantity).toBe("2");
    expect(milk?.listIds.toSorted()).toEqual([groceries.id, market.id].toSorted());
    expect(bread?.quantity).toBeNull();
    expect(bread?.listIds).toEqual([groceries.id]);

    // Deleting a list keeps the purchase history and clears its list id
    expect((await market.removeList()).status).toBe(204);
    const afterDelete = await historyOf(owner);
    expect(afterDelete.find((entry) => entry.name === "Milk")?.listIds).toEqual([groceries.id]);
  });

  it("detects items often bought on the same trip without pairing ubiquitous staples", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await shop(owner);
    const now = Temporal.Now.instant();

    const buyOnDay = async (daysAgo: number, names: string[]) => {
      for (const name of names) {
        const item = await list.add(name);
        await json(await list.patch(item.id, { checked: true }), 200);
        await db
          .update(shoppingPurchase)
          .set({ boughtAt: now.subtract({ hours: 24 * daysAgo }) })
          .where(eq(shoppingPurchase.id, item.id));
      }
    };

    // 6 trips: Milk on every trip; Pasta + Passata together on 2 trips
    await buyOnDay(1, ["Milk", "Pasta", "Passata"]);
    await buyOnDay(8, ["Milk", "Pasta", "Passata"]);
    await buyOnDay(15, ["Milk", "Bread"]);
    await buyOnDay(22, ["Milk", "Eggs"]);
    await buyOnDay(29, ["Milk", "Apples"]);
    await buyOnDay(36, ["Milk", "Cheese"]);

    const history = await historyOf(owner);
    const byName = new Map(history.map((entry) => [entry.name, entry]));
    expect(byName.get("Passata")?.pairedWith).toEqual(["Pasta"]);
    expect(byName.get("Pasta")?.pairedWith).toEqual(["Passata"]);
    // Milk is bought on every trip (lift = 1), so it doesn't pair with Pasta
    expect(byName.get("Milk")?.pairedWith).toEqual([]);
  });

  it("forgets named items from history for this household only", async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await householdWith(owner);
    await householdWith(outsider);
    const myList = await shop(owner);
    const theirList = await shop(outsider);

    for (const name of ["Paint roller", "paint roller", "Milk"]) {
      const item = await myList.add(name);
      await json(await myList.patch(item.id, { checked: true }), 200);
    }
    const theirs = await theirList.add("Paint roller");
    await json(await theirList.patch(theirs.id, { checked: true }), 200);

    const forgot = await owner.api.shopping.history.forget.$post({
      json: { names: ["Paint roller"] },
    });
    expect(await json(forgot, 200)).toEqual({ removed: 2 });
    expect((await historyOf(owner)).map(({ name }) => name)).toEqual(["Milk"]);
    // Outsider's history is untouched, and forgetting again is a safe no-op
    expect((await historyOf(outsider)).map(({ name }) => name)).toEqual(["Paint roller"]);
    const again = await owner.api.shopping.history.forget.$post({
      json: { names: ["Paint roller"] },
    });
    expect(await json(again, 200)).toEqual({ removed: 0 });

    const invalid = await owner.api.shopping.history.forget.$post({ json: { names: [] } });
    expect(await errorCode(invalid, 400)).toBe("INVALID_REQUEST");
  });

  it("counts one name once per day, whatever its case, spelled as last bought", async () => {
    const owner = await signUp();
    const household = await householdWith(owner);
    const list = await shop(owner);
    for (const name of ["milk", "Milk", "Eggs"]) {
      const item = await list.add(name);
      await json(await list.patch(item.id, { checked: true }), 200);
    }
    // Ticking again, or putting a cleared item back and ticking it, records nothing new
    const again = await list.add("Eggs");
    await json(await list.patch(again.id, { checked: true }), 200);
    await json(await list.clear(), 200);
    await list.add("Eggs", again.id);
    await json(await list.patch(again.id, { checked: true }), 200);

    const history = await historyOf(owner);
    expect(history.map(({ name, trips }) => ({ name, trips }))).toEqual([
      { name: "Eggs", trips: 1 },
      { name: "Milk", trips: 1 },
    ]);
    const rows = await db
      .select({ id: shoppingPurchase.id })
      .from(shoppingPurchase)
      .where(
        and(eq(shoppingPurchase.householdId, household.id), eq(shoppingPurchase.name, "Eggs")),
      );
    expect(rows).toHaveLength(2);
  });

  it("counts trips on different days and leaves out anything over a year old", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await shop(owner);
    const now = Temporal.Now.instant();
    const boughtOn = async (name: string, daysAgo: number) => {
      const item = await list.add(name);
      await json(await list.patch(item.id, { checked: true }), 200);
      await db
        .update(shoppingPurchase)
        .set({ boughtAt: now.subtract({ hours: 24 * daysAgo }) })
        .where(eq(shoppingPurchase.id, item.id));
    };
    await boughtOn("Coffee", 1);
    await boughtOn("Coffee", 8);
    await boughtOn("Coffee", 15);
    await boughtOn("Tea", 2);
    await boughtOn("Tinsel", 400);

    const history = await historyOf(owner);
    expect(history.map(({ name, trips }) => ({ name, trips }))).toEqual([
      { name: "Coffee", trips: 3 },
      { name: "Tea", trips: 1 },
    ]);
    const coffee = history[0];
    const daysBetween = Temporal.Instant.from(coffee?.firstBoughtAt ?? "").until(
      Temporal.Instant.from(coffee?.lastBoughtAt ?? ""),
    );
    expect(Math.round(daysBetween.total("hours") / 24)).toBe(14);
  });

  it("stays inside the household", async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await householdWith(owner);
    await householdWith(outsider);
    const list = await shop(owner);
    const item = await list.add("Milk");
    await json(await list.patch(item.id, { checked: true }), 200);

    expect(await historyOf(outsider)).toEqual([]);
    expect(await historyOf(owner)).toHaveLength(1);

    // Another household reusing the item's id can't take over or erase its purchase
    const theirs = await shop(outsider);
    await json(await list.clear(), 200);
    const copy = await theirs.add("Caviar", item.id);
    await json(await theirs.patch(copy.id, { checked: true }), 200);
    await json(await theirs.patch(copy.id, { checked: false }), 200);
    expect((await historyOf(owner)).map(({ name }) => name)).toEqual(["Milk"]);
    expect(await historyOf(outsider)).toEqual([]);
  });

  it("needs a household", async () => {
    const loner = await signUp();
    expect(await errorCode(await loner.api.shopping.history.$get(), 404)).toBe("NOT_IN_HOUSEHOLD");
    expect(
      await errorCode(
        await loner.api.shopping.history.forget.$post({ json: { names: ["Milk"] } }),
        404,
      ),
    ).toBe("NOT_IN_HOUSEHOLD");
  });
});

describe("limits", () => {
  it("stop a household at 50 lists", async () => {
    const owner = await signUp();
    const household = await householdWith(owner);
    await db
      .insert(shoppingList)
      .values(
        Array.from({ length: 50 }, (_, n) => ({ householdId: household.id, name: `List ${n}` })),
      );

    const oneMore = await owner.api.shopping.lists.$post({ json: { name: "One more" } });
    expect(await errorCode(oneMore, 409)).toBe("LIST_LIMIT_REACHED");
  });

  it("still accept a retry of a list that got in when the household is at its limit", async () => {
    const owner = await signUp();
    const household = await householdWith(owner);
    const id = randomUUID();
    await json(await owner.api.shopping.lists.$post({ json: { id, name: "The 50th" } }), 201);
    await db
      .insert(shoppingList)
      .values(
        Array.from({ length: 49 }, (_, n) => ({ householdId: household.id, name: `List ${n}` })),
      );

    const retry = await owner.api.shopping.lists.$post({ json: { id, name: "The 50th" } });
    expect(retry.status).toBe(201);
    const oneMore = await owner.api.shopping.lists.$post({ json: { name: "One more" } });
    expect(await errorCode(oneMore, 409)).toBe("LIST_LIMIT_REACHED");
  });

  it("stop a list at 500 items, but still accept a retry of an add that got in", async () => {
    const owner = await signUp();
    await householdWith(owner);
    const list = await listOf(owner);
    const items = owner.api.shopping.lists[":listId"].items;
    const param = { listId: list.id };
    const last = randomUUID();
    await db
      .insert(shoppingItem)
      .values(Array.from({ length: 499 }, (_, n) => ({ listId: list.id, name: `Item ${n}` })));
    await json(await items.$post({ param, json: { id: last, name: "The 500th" } }), 201);

    expect(await errorCode(await items.$post({ param, json: { name: "Too many" } }), 409)).toBe(
      "ITEM_LIMIT_REACHED",
    );
    await json(await items.$post({ param, json: { id: last, name: "The 500th" } }), 201);
  });
});
