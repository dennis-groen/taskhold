import { afterAll, describe, expect, it } from "vitest";

import { stopFeed } from "./live-changes.ts";
import {
  anonymous,
  errorCode,
  householdWith,
  json,
  signUp,
  type TestUser,
} from "../../../test/harness.ts";

afterAll(() => stopFeed());

/** A live stream as the app opens it, collecting the messages it receives */
async function openStream(person: TestUser) {
  const response = await person.api.live.$get();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  if (!response.body) throw new Error("No stream");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  const messages: string[] = [];
  let open = true;
  void (async () => {
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        for (const line of buffer.slice(0, end).split("\n")) {
          if (line.startsWith("data: ")) messages.push(line.slice("data: ".length));
        }
        buffer = buffer.slice(end + 2);
      }
    }
    open = false;
  })();

  await until(() => messages.includes("ready"));
  return {
    /** Messages after "ready" */
    received: () => messages.slice(1),
    isOpen: () => open,
    close: () => reader.cancel(),
  };
}

async function until(condition: () => boolean, timeout = 2_000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Gives a message that shouldn't come a moment to show up anyway */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

async function listOf(person: TestUser) {
  const { list } = await json(
    await person.api.shopping.lists.$post({ json: { name: "Food" } }),
    201,
  );
  return list;
}

describe("live updates", () => {
  it("need a session", async () => {
    expect(await errorCode(await anonymous.live.$get(), 401)).toBe("UNAUTHORIZED");
  });

  it("tell the household what changed, and nobody else", async () => {
    const owner = await signUp();
    const member = await signUp();
    const outsider = await signUp();
    await householdWith(owner, member);
    await householdWith(outsider);
    const ownerStream = await openStream(owner);
    const outsiderStream = await openStream(outsider);

    const list = await listOf(member);
    await json(
      await member.api.shopping.lists[":listId"].items.$post({
        param: { listId: list.id },
        json: { name: "Secret item" },
      }),
      201,
    );
    await until(() => ownerStream.received().length === 2);
    expect(ownerStream.received()).toEqual(["shopping", "shopping"]);

    await json(
      await member.api.chores.$post({
        json: { name: "Bins", repeat: null, dueOn: null, assigneeId: null },
      }),
      201,
    );
    await until(() => ownerStream.received().includes("chores"));

    await settle();
    expect(outsiderStream.received()).toEqual([]);
    // Topics only: what changed has to be fetched through the API
    expect(ownerStream.received().join()).not.toContain("Secret");
    await Promise.all([ownerStream.close(), outsiderStream.close()]);
  });

  it("send to-do changes only to the person's own devices", async () => {
    const owner = await signUp();
    const housemate = await signUp();
    await householdWith(owner, housemate);
    const phone = await openStream(owner);
    const laptop = await openStream(owner);
    const housemateStream = await openStream(housemate);

    await json(await owner.api.todos.$post({ json: { name: "Private" } }), 201);
    await until(() => phone.received().includes("todos") && laptop.received().includes("todos"));
    await settle();
    expect(housemateStream.received()).toEqual([]);
    await Promise.all([phone.close(), laptop.close(), housemateStream.close()]);
  });

  it("follow people into a household they join, and out of one they're removed from", async () => {
    const owner = await signUp();
    const newcomer = await signUp();
    const { inviteCode } = await householdWith(owner);
    const ownerStream = await openStream(owner);
    const newcomerStream = await openStream(newcomer);

    await json(
      await newcomer.api.households.invites[":code"].accept.$post({ param: { code: inviteCode } }),
      200,
    );
    await until(() => newcomerStream.received().includes("household"));
    await until(() => ownerStream.received().includes("household"));

    const list = await listOf(owner);
    await until(() => newcomerStream.received().includes("shopping"));

    await json(
      await owner.api.households.current.members[":userId"].$delete({
        param: { userId: newcomer.id },
      }),
      200,
    );
    // Once as a member of the household, once as the person who left it
    await until(() => newcomerStream.received().filter((m) => m === "household").length === 3);
    const before = newcomerStream.received().length;
    const renamed = await owner.api.shopping.lists[":listId"].$patch({
      param: { listId: list.id },
      json: { name: "After they left" },
    });
    expect(renamed.ok).toBe(true);
    await until(() => ownerStream.received().filter((m) => m === "shopping").length === 2);
    await settle();
    expect(newcomerStream.received()).toHaveLength(before);
    await Promise.all([ownerStream.close(), newcomerStream.close()]);
  });

  it("end when the account is deleted", async () => {
    const person = await signUp();
    const stream = await openStream(person);
    expect((await person.api.viewer.$delete()).status).toBe(204);
    await until(() => !stream.isOpen());
  });
});
