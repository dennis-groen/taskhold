import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import * as remindersRepo from "./reminders.repo.ts";
import * as remindersService from "./reminders.service.ts";
import type { PushMessage, PushResult, PushTarget } from "../../lib/push.ts";
import {
  errorCode,
  householdWith,
  json,
  signUp,
  utcToday,
  type TestUser,
} from "../../../test/harness.ts";

/** Subscribes a made-up device; returns its endpoint */
async function turnOn(person: TestUser, timeZone = "UTC") {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  const response = await person.api.reminders.subscription.$put({
    json: {
      subscription: { endpoint, keys: { p256dh: "BPublicKey-x_1", auth: "secret_1" } },
      timeZone,
    },
  });
  await json(response, 200);
  return endpoint;
}

/** A push sender that records what it would send */
function recorder(result: PushResult = "sent") {
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const send = async (target: PushTarget, message: PushMessage) => {
    sent.push({ endpoint: target.endpoint, message });
    return result;
  };
  return { sent, send, to: (endpoint: string) => sent.filter((s) => s.endpoint === endpoint) };
}

/** Today in UTC at a time of day, as the scheduler's clock would read it */
function todayAt(time: string): Temporal.Instant {
  return utcToday().toZonedDateTime({ timeZone: "UTC", plainTime: time }).toInstant();
}

async function choreOf(
  person: TestUser,
  chore: { name: string; dueOn: Temporal.PlainDate | null; assigneeId?: string | null },
) {
  const response = await person.api.chores.$post({
    json: {
      name: chore.name,
      repeat: null,
      dueOn: chore.dueOn?.toString() ?? null,
      assigneeId: chore.assigneeId ?? null,
    },
  });
  return (await json(response, 201)).chore;
}

describe("turning reminders on", () => {
  it("only accepts devices of real push services", async () => {
    const person = await signUp();
    for (const endpoint of [
      "https://evil.example/push",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://localhost/fcm",
      // Hosts that web-push's legacy url.parse reads as attacker.example or evil.example
      "https://attacker.example%2e.push.apple.com/x",
      "https://127.0.0.1%2E.push.apple.com/x",
      "https://evil.example;.notify.windows.com/",
      "https://evil.example`.notify.windows.com/",
      "https://evil.example{.push.services.mozilla.com/",
      "https://fcm.googleapis.com\\@evil.example/",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
    ]) {
      const response = await person.api.reminders.subscription.$put({
        json: { subscription: { endpoint, keys: { p256dh: "abc", auth: "def" } }, timeZone: "UTC" },
      });
      expect(await errorCode(response, 400)).toBe("INVALID_REQUEST");
    }
  });

  it("starts at 08:00 in the device's time zone, and the time can be changed", async () => {
    const person = await signUp();
    expect((await json(await person.api.reminders.$get(), 200)).settings).toBeNull();
    await turnOn(person, "Europe/Amsterdam");

    const status = await json(await person.api.reminders.$get(), 200);
    expect(status).toMatchObject({
      available: true,
      settings: { remindAt: "08:00", timeZone: "Europe/Amsterdam" },
    });
    expect(status.publicKey).toBeTruthy();

    const changed = await person.api.reminders.settings.$patch({ json: { remindAt: "19:30" } });
    expect((await json(changed, 200)).settings?.remindAt).toBe("19:30");
    const invalid = await person.api.reminders.settings.$patch({ json: { remindAt: "25:00" } });
    expect(await errorCode(invalid, 400)).toBe("INVALID_REQUEST");
  });

  it("can't change the time before turning them on", async () => {
    const person = await signUp();
    const response = await person.api.reminders.settings.$patch({ json: { remindAt: "09:00" } });
    expect(await errorCode(response, 409)).toBe("REMINDERS_OFF");
  });
});

/** The summary someone gets with one chore of their own today and the shared one overdue */
const summaryWith = (mine: string) => ({
  title: "1 chore today, 1 overdue",
  body: `Shared plants and ${mine}`,
  url: "/chores",
  tag: "chore-reminder",
});

describe("the daily summary", () => {
  it("lists each person's chores that are due or overdue, assigned to them or to nobody", async () => {
    const owner = await signUp();
    const member = await signUp();
    await householdWith(owner, member);
    const today = utcToday();
    await choreOf(owner, { name: "Owner's bins", dueOn: today, assigneeId: owner.id });
    await choreOf(owner, { name: "Member's laundry", dueOn: today, assigneeId: member.id });
    await choreOf(owner, { name: "Shared plants", dueOn: today.subtract({ days: 2 }) });
    await choreOf(owner, { name: "Tomorrow's mop", dueOn: today.add({ days: 1 }) });
    await choreOf(owner, { name: "Whenever", dueOn: null });
    const done = await choreOf(owner, { name: "Already done", dueOn: today });
    await json(
      await owner.api.chores[":choreId"].complete.$post({
        param: { choreId: done.id },
        json: { today: today.toString() },
      }),
      200,
    );
    const ownerPhone = await turnOn(owner);
    const ownerLaptop = await turnOn(owner);
    const memberPhone = await turnOn(member);

    const push = recorder();
    await remindersService.sendDueReminders(todayAt("09:00"), push.send);

    expect(push.to(ownerPhone).map((s) => s.message)).toEqual([summaryWith("Owner's bins")]);
    expect(push.to(ownerLaptop)).toHaveLength(1);
    expect(push.to(memberPhone).map((s) => s.message)).toEqual([summaryWith("Member's laundry")]);

    // Once a day
    const again = recorder();
    await remindersService.sendDueReminders(todayAt("15:00"), again.send);
    expect(again.to(ownerPhone)).toEqual([]);
  });

  it("waits for the person's own time in their own time zone", async () => {
    const person = await signUp();
    await householdWith(person);
    await choreOf(person, { name: "Bins", dueOn: utcToday() });
    // Tokyo is 9 hours ahead of UTC and doesn't change clocks
    const phone = await turnOn(person, "Asia/Tokyo");
    await json(await person.api.reminders.settings.$patch({ json: { remindAt: "20:00" } }), 200);

    const early = recorder();
    await remindersService.sendDueReminders(todayAt("10:30"), early.send); // 19:30 in Tokyo
    expect(early.to(phone)).toEqual([]);

    const onTime = recorder();
    await remindersService.sendDueReminders(todayAt("11:00"), onTime.send); // 20:00 in Tokyo
    expect(onTime.to(phone).map((s) => s.message.title)).toEqual(["1 chore today"]);
  });

  it("stays quiet when nothing is due, or there's no household", async () => {
    const busy = await signUp();
    await householdWith(busy);
    await choreOf(busy, { name: "Later", dueOn: utcToday().add({ days: 3 }) });
    const loner = await signUp();
    const busyPhone = await turnOn(busy);
    const lonerPhone = await turnOn(loner);

    const push = recorder();
    await remindersService.sendDueReminders(todayAt("09:00"), push.send);
    expect([...push.to(busyPhone), ...push.to(lonerPhone)]).toEqual([]);
  });

  it("names a few chores and counts the rest", () => {
    expect(
      remindersService.summary({ today: ["A", "B", "C"], overdue: ["D", "E", "F"] }),
    ).toMatchObject({ title: "3 chores today, 3 overdue", body: "D, E, F, A and 2 more" });
    expect(remindersService.summary({ today: [], overdue: ["Bins"] })).toMatchObject({
      title: "1 chore overdue",
      body: "Bins",
    });
    expect(remindersService.summary({ today: [], overdue: [] })).toBeNull();
  });
});

describe("devices", () => {
  it("are forgotten when the push service says they're gone", async () => {
    const person = await signUp();
    await turnOn(person);
    const gone = recorder("gone");
    expect(await remindersService.sendTest(person.id, gone.send)).toBe(0);
    expect(gone.sent).toHaveLength(1);

    await expect(remindersService.sendTest(person.id, recorder().send)).rejects.toMatchObject({
      code: "NO_REMINDER_DEVICES",
    });
  });

  it("saved before the endpoint check was strict are never sent to, and are forgotten", async () => {
    const person = await signUp();
    const keep = await turnOn(person);
    // Passed the old suffix check, but web-push would connect to evil.example
    await remindersRepo.upsertSubscription({
      userId: person.id,
      endpoint: `https://evil.example;.push.apple.com/${randomUUID()}`,
      p256dh: "BPublicKey-x_1",
      auth: "secret_1",
    });

    const push = recorder();
    expect(await remindersService.sendTest(person.id, push.send)).toBe(1);
    expect(push.sent.map((s) => s.endpoint)).toEqual([keep]);
    const left = await remindersRepo.findSubscriptions(person.id);
    expect(left.map((device) => device.endpoint)).toEqual([keep]);
  });

  it("move to whoever signs in on that browser, and turn off one at a time", async () => {
    const first = await signUp();
    const second = await signUp();
    const browser = await turnOn(first);
    const keep = await turnOn(first);

    // Same browser, now signed in as someone else
    await json(
      await second.api.reminders.subscription.$put({
        json: {
          subscription: { endpoint: browser, keys: { p256dh: "BOther", auth: "other" } },
          timeZone: "UTC",
        },
      }),
      200,
    );
    const firstDevices = await remindersRepo.findSubscriptions(first.id);
    expect(firstDevices.map((device) => device.endpoint)).toEqual([keep]);

    // Someone else's device can't be turned off by its endpoint
    const off = await first.api.reminders.subscription.$delete({ json: { endpoint: browser } });
    expect(off.status).toBe(204);
    const secondPush = recorder();
    await remindersService.sendTest(second.id, secondPush.send);
    expect(secondPush.sent.map((s) => s.endpoint)).toEqual([browser]);
  });

  it("are kept to the 10 most recently turned on, per person", async () => {
    const person = await signUp();
    const oldest = await turnOn(person);
    const second = await turnOn(person);
    for (let device = 0; device < 8; device++) await turnOn(person);
    // Turning a device on again makes it the newest
    await json(
      await person.api.reminders.subscription.$put({
        json: {
          subscription: { endpoint: oldest, keys: { p256dh: "BPublicKey-x_1", auth: "secret_1" } },
          timeZone: "UTC",
        },
      }),
      200,
    );
    const newest = await turnOn(person);

    const endpoints = (await remindersRepo.findSubscriptions(person.id)).map((d) => d.endpoint);
    expect(endpoints).toHaveLength(10);
    expect(endpoints).toEqual(expect.arrayContaining([oldest, newest]));
    expect(endpoints).not.toContain(second);
  });
});

describe("test notifications", () => {
  it("go out at most once a minute per person, even when asked for all at once", async () => {
    const person = await signUp();
    await turnOn(person);

    const push = recorder();
    const burst = await Promise.allSettled(
      Array.from({ length: 5 }, () => remindersService.sendTest(person.id, push.send)),
    );
    expect(burst.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(push.sent).toHaveLength(1);

    const again = await person.api.reminders.test.$post();
    expect(await errorCode(again, 429)).toBe("TEST_SENT_RECENTLY");

    // Only this person is held back
    const other = await signUp();
    await turnOn(other);
    expect(await remindersService.sendTest(other.id, recorder().send)).toBe(1);
  });
});
