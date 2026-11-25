// The demo: visitors try the app without signing in. Each gets an anonymous account and a sealed
// household of their own with two made-up housemates, seeded so every screen has something on it,
// and deleted a day later. Off unless DEMO_MODE is set.
import { transaction, type Executor } from "../../db/db.ts";
import { env } from "../../env.ts";
import { oneAtATime } from "../../lib/one-at-a-time.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as authService from "../auth/auth.service.ts";
import * as householdsService from "../households/households.service.ts";
import { announce } from "../live/live-changes.ts";
import * as shoppingService from "../shopping/shopping.service.ts";
import { buildDemoSeed } from "./demo-seed.ts";
import * as demoRepo from "./demo.repo.ts";
import {
  alreadyInDemo,
  demoBudgetSpent,
  demoFull,
  demoOff,
  notInDemo,
  tooManyDemos,
} from "./demo.errors.ts";
import type { DemoStatus, HousemateAction } from "./demo.schema.ts";

/** How long a demo lasts before it's deleted */
export const DEMO_LASTS = Temporal.Duration.from({ hours: 24 });

// Demo households that may exist at once, so a flood of visitors can't fill the database
const MAX_DEMOS = 500;

// Demos one IP address may have at once (until each ends or is deleted). With MAX_DEMOS, filling
// the demo up takes a hundred addresses rather than a handful.
const DEMOS_PER_IP = 5;

/**
 * Changes a demo household may take, all of its visitor's requests together: the hard ceiling on
 * what one demo can write. Every change adds at most a couple of rows, and no endpoint takes a
 * batch, so this bounds a demo to a few thousand rows however it's driven. Far above what trying
 * the app takes.
 */
export const DEMO_WRITE_BUDGET = 1000;

// Demos and stray accounts deleted per cleanup run; the next run takes the rest
const CLEANUP_BATCH = 100;

// What a housemate adds when everything on the lists is already ticked
const SPARE_ITEMS = ["Lemons", "Peanut butter", "Rice", "Tomatoes", "Onions", "Apples"];

/**
 * Starts a demo for a visitor: signs in a new anonymous account and seeds its household. `headers`
 * carry the client IP chain, which limits how many demos one address may start, and
 * `currentUserId` is whoever is signed in already. Returns the session cookies to set.
 */
export async function startDemo(
  headers: Headers,
  currentUserId: string | null,
): Promise<{ cookies: string[] }> {
  if (!env.DEMO_MODE) throw demoOff();
  if (currentUserId && (await authService.isAnonymous(currentUserId))) throw alreadyInDemo();
  // As Better Auth records it (an IPv6 address by its /64, so one machine can't rotate through
  // them). Visitors whose address can't be told share one allowance, rather than having none.
  const ip = authService.clientIpOf(headers) ?? "";
  // Before anything is written, so most refused requests cost two queries. Seeding counts again
  // under a lock, which settles a burst of starts that all passed here.
  await refuseIfFull(ip);

  const { userId, cookies } = await authService.signInAnonymously(headers);
  annotate("demo", { user_id: userId });
  try {
    await seed(userId, ip);
  } catch (err) {
    // Nothing of a demo that didn't start is left behind, cookies included
    await transaction((tx) => demoRepo.deleteDemos({ householdIds: [], userIds: [userId] }, tx));
    throw err;
  }
  return { cookies };
}

/**
 * Refuses a new demo when MAX_DEMOS exist, or DEMOS_PER_IP started from `ip`. Demos are counted
 * by household, so one stays counted until it ends or expires, signed in or not.
 */
async function refuseIfFull(ip: string, executor?: Executor): Promise<void> {
  if ((await demoRepo.countDemoHouseholds(executor)) >= MAX_DEMOS) throw demoFull();
  const running = await demoRepo.countDemoHouseholdsFrom(ip, executor);
  annotate("demo", { running_from_ip: running });
  if (running >= DEMOS_PER_IP) throw tooManyDemos();
}

/**
 * Takes one change from the demo's budget before a demo visitor's change goes ahead, and refuses
 * it once the budget is spent. Counted in the database, so it holds across API instances.
 */
export async function spendDemoWrite(userId: string): Promise<void> {
  const spent = await demoRepo.spendDemoWrite(userId);
  if (spent === null) throw notInDemo();
  annotate("demo", { writes: spent });
  if (spent > DEMO_WRITE_BUDGET) throw demoBudgetSpent();
}

async function seed(visitorId: string, ip: string): Promise<void> {
  const now = Temporal.Now.instant();
  const today = now.toZonedDateTimeISO("UTC").toPlainDate();
  // One start at a time, so concurrent starts can't all pass the limits: queued here within this
  // instance first, holding no database connection while they wait, then locked across instances
  const householdId = await oneAtATime("demo-start", () =>
    transaction(async (tx) => {
      await demoRepo.lockDemoStarts(tx);
      await refuseIfFull(ip, tx);
      const [noor, sam] = await demoRepo.insertHousemates(["Noor", "Sam"], tx);
      if (!noor || !sam) throw new Error("Couldn't make the demo housemates");
      const id = await householdsService.createDemoHousehold(
        { name: "The Flat", ownerId: visitorId, memberIds: [noor, sam] },
        tx,
      );
      await demoRepo.recordDemoIp(id, ip, tx);
      const people = { you: visitorId, noor, sam };
      await demoRepo.insertSeed(
        { householdId: id, visitorId },
        buildDemoSeed(people, now, today),
        tx,
      );
      return id;
    }),
  );
  annotate("demo", { household_id: householdId });
}

/** Whether the demo is offered here, and when the user's own demo ends if they're in one */
export async function demoStatusOf(userId: string | null): Promise<DemoStatus> {
  const demo = userId ? await demoRepo.findDemoHouseholdOf(userId) : null;
  return { available: env.DEMO_MODE, endsAt: demo ? demo.createdAt.add(DEMO_LASTS) : null };
}

/**
 * Ends the visitor's demo now: deletes its household, the housemates and the visitor's account.
 * Their streams close; the caller clears the session cookie.
 */
export async function endDemo(userId: string): Promise<void> {
  if (!(await authService.isAnonymous(userId))) throw notInDemo();
  await transaction(async (tx) => {
    const demo = await demoRepo.findDemoHouseholdOf(userId, tx);
    await demoRepo.deleteDemos(
      { householdIds: demo ? [demo.id] : [], userIds: [userId, ...(demo?.memberIds ?? [])] },
      tx,
    );
    await announce({ userId, topic: "account" }, tx);
  });
  annotate("demo", { ended: true });
}

/**
 * A housemate does something on the shopping list, through the same service and live updates as a
 * real person would, so the visitor sees another person's change arrive: they tick the oldest
 * unticked item, or add one when everything is ticked.
 */
export async function housemateActs(userId: string): Promise<HousemateAction> {
  if (!(await demoRepo.findDemoHouseholdOf(userId))) throw notInDemo();
  const { members } = await householdsService.getHouseholdOf(userId);
  // The first to join after the visitor: Noor, unless the visitor removed her
  const housemate = members.find((member) => member.id !== userId);
  if (!housemate) throw notInDemo();

  const summaries = await shoppingService.getLists(housemate.id);
  const lists = await Promise.all(
    summaries.map((summary) => shoppingService.getList(housemate.id, summary.id)),
  );
  // The list they're out shopping for comes first
  lists.sort(
    (a, b) =>
      Number(b.trip?.shopper?.id === housemate.id) - Number(a.trip?.shopper?.id === housemate.id),
  );
  for (const list of lists) {
    // Items come newest first
    const unticked = list.items.findLast((item) => !item.checked);
    if (unticked) {
      await shoppingService.updateItem(
        housemate.id,
        { listId: list.id, itemId: unticked.id },
        { checked: true },
      );
      return { housemate: housemate.name, action: "ticked", item: unticked.name };
    }
  }

  const list = lists[0];
  if (!list) throw notInDemo();
  const name = SPARE_ITEMS[Math.floor(Math.random() * SPARE_ITEMS.length)] ?? "Lemons";
  await shoppingService.addItem(housemate.id, list.id, { name });
  return { housemate: housemate.name, action: "added", item: name };
}

/**
 * Deletes demos older than DEMO_LASTS, and anonymous accounts left outside any household for that
 * long. Returns how many of each went.
 */
export async function removeExpiredDemos(
  now: Temporal.Instant,
): Promise<{ households: number; accounts: number }> {
  const cutoff = now.subtract(DEMO_LASTS);
  return transaction(async (tx) => {
    const demos = await demoRepo.findDemoHouseholdsBefore(cutoff, CLEANUP_BATCH, tx);
    const strays = await demoRepo.findStrayAnonymousUsersBefore(cutoff, CLEANUP_BATCH, tx);
    const userIds = [...demos.flatMap((demo) => demo.memberIds), ...strays];
    await demoRepo.deleteDemos({ householdIds: demos.map((demo) => demo.id), userIds }, tx);
    for (const id of userIds) await announce({ userId: id, topic: "account" }, tx);
    return { households: demos.length, accounts: userIds.length };
  });
}
