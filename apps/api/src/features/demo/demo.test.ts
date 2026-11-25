import { afterEach, describe, expect, it } from "vitest";

import { app } from "../../app.ts";
import { env } from "../../env.ts";
import {
  anonymous,
  clientFor,
  errorCode,
  householdWith,
  json,
  signUp,
} from "../../../test/harness.ts";
import { eq } from "drizzle-orm";

import { db } from "../../db/db.ts";
import { household as householdTable } from "../households/households.table.ts";
import { DEMO_WRITE_BUDGET, removeExpiredDemos } from "./demo.service.ts";

/** Starts a demo from `ip`, and returns the API as that visitor */
async function startDemo(ip = randomIp()) {
  const started = await clientFor({ "x-forwarded-for": ip }).demo.$post();
  expect(started.status).toBe(204);
  const cookie = started.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
  const visitor = clientFor({ cookie });
  const viewer = await json(await visitor.viewer.$get(), 200);
  if (!viewer.user || !viewer.household) throw new Error("The demo didn't sign in");
  return { api: visitor, cookie, user: viewer.user, household: viewer.household, viewer };
}

function randomIp() {
  return `10.${ipPart()}.${ipPart()}.${ipPart()}`;
}

function ipPart() {
  return Math.floor(Math.random() * 250) + 1;
}

afterEach(() => {
  env.DEMO_MODE = true;
});

describe("starting the demo", () => {
  it("signs the visitor in to a household of their own with something on every screen", async () => {
    const { api, user, household, viewer } = await startDemo();

    expect(user.name).toBe("Alex");
    expect(household).toMatchObject({ name: "The Flat", role: "owner" });
    expect(viewer.demo.available).toBe(true);
    const endsIn = Temporal.Instant.from(viewer.demo.endsAt ?? "").since(Temporal.Now.instant());
    expect(endsIn.total("hours")).toBeGreaterThan(23.9);

    const {
      household: { members },
    } = await json(await api.households.current.$get(), 200);
    expect(members.map((member) => member.name)).toEqual(["Alex", "Noor", "Sam"]);

    const { lists } = await json(await api.shopping.lists.$get(), 200);
    // Oldest first, so the everyday list leads
    expect(lists.map((list) => list.name)).toEqual([
      "Groceries",
      "Drugstore",
      "Hardware store",
      "Saturday BBQ",
    ]);
    const groceries = lists.find((list) => list.name === "Groceries");
    const { list } = await json(
      await api.shopping.lists[":listId"].$get({ param: { listId: groceries?.id ?? "" } }),
      200,
    );
    expect(list.items.length).toBeGreaterThan(15);
    expect(list.trip?.shopper?.name).toBe("Noor");

    const { items: history } = await json(await api.shopping.history.$get(), 200);
    expect(history.length).toBeGreaterThan(20);

    const { chores } = await json(await api.chores.$get(), 200);
    expect(chores.length).toBe(10);
    const { todos } = await json(await api.todos.$get(), 200);
    expect(todos.length).toBe(6);
  });

  it("tells signed-out visitors the demo is there", async () => {
    const viewer = await json(await anonymous.viewer.$get(), 200);
    expect(viewer.demo).toEqual({ available: true, endsAt: null });
  });

  it("isn't there unless DEMO_MODE is on", async () => {
    env.DEMO_MODE = false;
    expect(await errorCode(await anonymous.demo.$post(), 404)).toBe("DEMO_OFF");
    expect((await json(await anonymous.viewer.$get(), 200)).demo.available).toBe(false);
  });

  it("won't start a second demo inside one", async () => {
    const { api } = await startDemo();
    expect(await errorCode(await api.demo.$post(), 409)).toBe("ALREADY_IN_DEMO");
  });

  it("lets one address run five demos at once", async () => {
    const ip = randomIp();
    const running = [];
    for (let i = 0; i < 5; i++) running.push(await startDemo(ip));
    const sixth = await clientFor({ "x-forwarded-for": ip }).demo.$post();
    expect(await errorCode(sixth, 429)).toBe("TOO_MANY_DEMOS");
    // Nothing is left of the refused one: no session cookie
    expect(sixth.headers.getSetCookie()).toEqual([]);
    // Another address can still start one
    await startDemo();
    // Ending one makes room again
    expect((await running[0]?.api.demo.$delete())?.status).toBe(204);
    await startDemo(ip);
  });

  it("counts an IPv6 visitor by their /64, so new addresses don't reset the budget", async () => {
    const prefix = `2001:db8:${ipPart().toString(16)}:${ipPart().toString(16)}`;
    for (let i = 1; i <= 5; i++) await startDemo(`${prefix}::${i}`);
    const sixth = await clientFor({ "x-forwarded-for": `${prefix}::abcd` }).demo.$post();
    expect(await errorCode(sixth, 429)).toBe("TOO_MANY_DEMOS");
  });

  it("keeps counting a demo after its visitor signs out", async () => {
    const ip = randomIp();
    const running = [];
    for (let i = 0; i < 5; i++) running.push(await startDemo(ip));
    const signedOut = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { origin: new URL(env.BETTER_AUTH_URL).origin, cookie: running[0]?.cookie ?? "" },
    });
    expect(signedOut.status).toBe(200);
    const sixth = await clientFor({ "x-forwarded-for": ip }).demo.$post();
    expect(await errorCode(sixth, 429)).toBe("TOO_MANY_DEMOS");
  });

  it("starts five at most from a burst of requests from one address", async () => {
    const ip = randomIp();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => clientFor({ "x-forwarded-for": ip }).demo.$post()),
    );
    const statuses = responses.map((response) => response.status).toSorted((a, b) => a - b);
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429, 429, 429]);
    // The refused ones left no account behind
    const refused = responses.filter((response) => response.status !== 204);
    for (const response of refused) expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("only starts from the app itself", async () => {
    const response = await anonymous.demo.$post(undefined, {
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("isn't open to Better Auth's own anonymous sign-in", async () => {
    const response = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { origin: new URL(env.BETTER_AUTH_URL).origin },
    });
    expect(response.status).toBe(404);
  });
});

describe("the demo household", () => {
  it("gets no notifications, so demos can't send pushes on the server's behalf", async () => {
    const { api } = await startDemo();
    const status = await json(await api.reminders.$get(), 200);
    expect(status).toMatchObject({ available: false, publicKey: null });
    const subscribed = await api.reminders.subscription.$put({
      json: {
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/demo-device",
          keys: { p256dh: "BPublicKey-x_1", auth: "secret_1" },
        },
        timeZone: "UTC",
      },
    });
    expect(await errorCode(subscribed, 403)).toBe("REMINDERS_NOT_IN_DEMO");
    expect(await errorCode(await api.reminders.test.$post(), 403)).toBe("REMINDERS_NOT_IN_DEMO");
  });

  it("can't be joined with its invite code", async () => {
    const { api } = await startDemo();
    const {
      household: { inviteCode },
    } = await json(await api.households.current.$get(), 200);
    const stranger = await signUp();
    const joined = await stranger.api.households.invites[":code"].accept.$post({
      param: { code: inviteCode },
    });
    expect(await errorCode(joined, 404)).toBe("INVITE_NOT_FOUND");
  });

  it("keeps the visitor in it: they can't start, join or leave a household", async () => {
    const { api } = await startDemo();
    const owner = await signUp();
    const real = await householdWith(owner);

    const created = await api.households.$post({ json: { name: "Mine" } });
    expect(await errorCode(created, 403)).toBe("DEMO_HOUSEHOLD_ONLY");
    const joined = await api.households.invites[":code"].accept.$post({
      param: { code: real.inviteCode },
    });
    expect(await errorCode(joined, 403)).toBe("DEMO_HOUSEHOLD_ONLY");
    expect(await errorCode(await api.households.current.leave.$post(), 403)).toBe(
      "DEMO_HOUSEHOLD_ONLY",
    );
  });
});

describe("two demos", () => {
  it("never see or touch each other's lists, chores, to-dos or people", async () => {
    const a = await startDemo();
    const b = await startDemo();
    expect(a.household.id).not.toBe(b.household.id);

    const { lists: listsOfA } = await json(await a.api.shopping.lists.$get(), 200);
    const { chores: choresOfA } = await json(await a.api.chores.$get(), 200);
    const { todos: todosOfA } = await json(await a.api.todos.$get(), 200);
    const listOfA = listsOfA[0]?.id ?? "";
    const choreOfA = choresOfA[0]?.id ?? "";
    const todoOfA = todosOfA[0]?.id ?? "";

    // Each sees only their own
    const { lists: listsOfB } = await json(await b.api.shopping.lists.$get(), 200);
    expect(listsOfB.map((list) => list.id)).not.toContain(listOfA);
    const { household: householdOfB } = await json(await b.api.households.current.$get(), 200);
    const { household: householdOfA } = await json(await a.api.households.current.$get(), 200);
    const idsOfA = householdOfA.members.map((member) => member.id);
    expect(householdOfB.members.some((member) => idsOfA.includes(member.id))).toBe(false);

    // A's ids read as missing to B, and B's changes to them go nowhere
    const listParam = { param: { listId: listOfA } };
    expect((await b.api.shopping.lists[":listId"].$get(listParam)).status).toBe(404);
    const renamed = await b.api.shopping.lists[":listId"].$patch({
      ...listParam,
      json: { name: "Mine now" },
    });
    expect(renamed.status).toBe(404);
    const choreParam = { param: { choreId: choreOfA } };
    expect((await b.api.chores[":choreId"].$get(choreParam)).status).toBe(404);
    const todoParam = { param: { todoId: todoOfA } };
    expect((await b.api.todos[":todoId"].$delete(todoParam)).status).toBeLessThan(300);
    expect((await json(await a.api.todos.$get(), 200)).todos.map((todo) => todo.id)).toContain(
      todoOfA,
    );

    // B's housemate acts in B's demo only
    const before = await json(await a.api.shopping.lists[":listId"].$get(listParam), 200);
    await json(await b.api.demo.housemate.$post(), 200);
    const after = await json(await a.api.shopping.lists[":listId"].$get(listParam), 200);
    expect(after).toEqual(before);
  });
});

describe("the demo's budget", () => {
  it("stops a demo's changes once it has taken its budget, but not reading or ending it", async () => {
    const { api, household } = await startDemo();
    await db
      .update(householdTable)
      .set({ demoWrites: DEMO_WRITE_BUDGET - 1 })
      .where(eq(householdTable.id, household.id));

    await json(await api.todos.$post({ json: { name: "The last one" } }), 201);
    const refused = await api.todos.$post({ json: { name: "One too many" } });
    expect(await errorCode(refused, 429)).toBe("DEMO_BUDGET_SPENT");
    expect(await errorCode(await api.demo.housemate.$post(), 429)).toBe("DEMO_BUDGET_SPENT");

    expect((await json(await api.todos.$get(), 200)).todos).toHaveLength(7);
    expect((await api.demo.$delete()).status).toBe(204);
  });

  it("doesn't count real people's changes", async () => {
    const person = await signUp();
    await householdWith(person);
    for (let i = 0; i < 3; i++) {
      await json(await person.api.todos.$post({ json: { name: `Thing ${i}` } }), 201);
    }
  });
});

describe("a housemate's turn", () => {
  it("ticks the oldest unticked item as Noor", async () => {
    const { api } = await startDemo();
    const action = await json(await api.demo.housemate.$post(), 200);
    expect(action).toEqual({ housemate: "Noor", action: "ticked", item: "Oat milk" });

    const { lists } = await json(await api.shopping.lists.$get(), 200);
    const groceries = lists.find((list) => list.name === "Groceries");
    const { list } = await json(
      await api.shopping.lists[":listId"].$get({ param: { listId: groceries?.id ?? "" } }),
      200,
    );
    const milk = list.items.find((item) => item.name === "Oat milk");
    expect(milk?.checked).toBe(true);
    expect(milk?.checkedBy?.name).toBe("Noor");
  });

  it("is only for demo visitors", async () => {
    const person = await signUp();
    await householdWith(person);
    expect(await errorCode(await person.api.demo.housemate.$post(), 404)).toBe("NOT_IN_DEMO");
    expect(await errorCode(await anonymous.demo.housemate.$post(), 401)).toBe("UNAUTHORIZED");
  });
});

describe("ending the demo", () => {
  it("deletes the household, the housemates and the visitor, and signs them out", async () => {
    const { api } = await startDemo();
    const ended = await api.demo.$delete();
    expect(ended.status).toBe(204);
    expect(ended.headers.getSetCookie().join("\n")).toMatch(/session_token=;.*Max-Age=0/);
    expect(await errorCode(await api.todos.$get(), 401)).toBe("UNAUTHORIZED");
  });

  it("happens when the visitor deletes their account too", async () => {
    const { api } = await startDemo();
    expect((await api.viewer.$delete()).status).toBe(204);
    expect(await errorCode(await api.todos.$get(), 401)).toBe("UNAUTHORIZED");
  });

  it("is only for demo visitors", async () => {
    const person = await signUp();
    await householdWith(person);
    expect(await errorCode(await person.api.demo.$delete(), 404)).toBe("NOT_IN_DEMO");
    expect(
      (await json(await person.api.households.current.$get(), 200)).household.members,
    ).toHaveLength(1);
  });

  it("happens by itself after a day, and leaves real households alone", async () => {
    const { api } = await startDemo();
    const person = await signUp();
    await householdWith(person);

    await removeExpiredDemos(Temporal.Now.instant());
    expect((await api.todos.$get()).status).toBe(200);

    await removeExpiredDemos(Temporal.Now.instant().add({ hours: 25 }));
    expect(await errorCode(await api.todos.$get(), 401)).toBe("UNAUTHORIZED");
    expect(
      (await json(await person.api.households.current.$get(), 200)).household.members,
    ).toHaveLength(1);
  });
});
