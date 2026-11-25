// What a demo household starts with: four lists, two months of shopping trips, chores that have
// been kept up (mostly), and private to-dos. Everything is dated from `today`, so the demo never
// looks stale. Plain records only; demo.repo.ts inserts them.

/** The visitor and the two made-up housemates the demo household is shared with */
export type DemoPeople = { you: string; noor: string; sam: string };

type RepeatRule = { every: number; unit: "day" | "week" };

export type DemoSeed = {
  lists: { id: string; name: string }[];
  items: {
    listId: string;
    name: string;
    quantity: string | null;
    addedById: string;
    checkedById: string | null;
    checkedAt: Temporal.Instant | null;
    createdAt: Temporal.Instant;
  }[];
  purchases: {
    listId: string;
    name: string;
    quantity: string | null;
    boughtAt: Temporal.Instant;
  }[];
  trip: { listId: string; shopperId: string; startedAt: Temporal.Instant };
  chores: {
    id: string;
    name: string;
    repeat: RepeatRule | null;
    dueOn: Temporal.PlainDate | null;
    assigneeId: string | null;
    history: { completedById: string; completedOn: Temporal.PlainDate; skipped: boolean }[];
  }[];
  todos: {
    name: string;
    notes: string | null;
    dueOn: Temporal.PlainDate | null;
    doneAt: Temporal.Instant | null;
  }[];
};

type ListKey = "groceries" | "bbq" | "hardware" | "drugstore";

/** What the household buys again and again, how often (every so many days), and where */
const USUALS: { name: string; quantity: string | null; everyDays: number; list: ListKey }[] = [
  { name: "Oat milk", quantity: "2", everyDays: 4, list: "groceries" },
  { name: "Bananas", quantity: null, everyDays: 4, list: "groceries" },
  { name: "Sourdough", quantity: null, everyDays: 5, list: "groceries" },
  { name: "Spinach", quantity: null, everyDays: 7, list: "groceries" },
  { name: "Greek yoghurt", quantity: null, everyDays: 7, list: "groceries" },
  { name: "Eggs", quantity: "12", everyDays: 8, list: "groceries" },
  { name: "Cherry tomatoes", quantity: null, everyDays: 7, list: "groceries" },
  { name: "Avocados", quantity: "3", everyDays: 8, list: "groceries" },
  { name: "Hummus", quantity: null, everyDays: 9, list: "groceries" },
  { name: "Pasta", quantity: "2", everyDays: 10, list: "groceries" },
  { name: "Coffee", quantity: null, everyDays: 12, list: "groceries" },
  { name: "Cheddar", quantity: null, everyDays: 12, list: "groceries" },
  { name: "Sparkling water", quantity: "6", everyDays: 9, list: "groceries" },
  { name: "Dark chocolate", quantity: null, everyDays: 10, list: "groceries" },
  { name: "Frozen peas", quantity: null, everyDays: 16, list: "groceries" },
  { name: "Toilet paper", quantity: null, everyDays: 18, list: "groceries" },
  { name: "Kitchen roll", quantity: null, everyDays: 20, list: "groceries" },
  { name: "Olive oil", quantity: null, everyDays: 25, list: "groceries" },
  { name: "Laundry detergent", quantity: null, everyDays: 28, list: "groceries" },
  { name: "Toothpaste", quantity: null, everyDays: 24, list: "drugstore" },
  { name: "Shampoo", quantity: null, everyDays: 30, list: "drugstore" },
  { name: "Burger buns", quantity: "8", everyDays: 14, list: "bbq" },
  { name: "Sausages", quantity: "12", everyDays: 14, list: "bbq" },
  { name: "Beer", quantity: "12", everyDays: 14, list: "bbq" },
];

const HISTORY_DAYS = 56;
// Someone shops every few days; each trip buys whatever has run out by then
const TRIP_EVERY_DAYS = [3, 4, 3, 4, 5];

export function buildDemoSeed(
  people: DemoPeople,
  now: Temporal.Instant,
  today: Temporal.PlainDate,
): DemoSeed {
  const listIds: Record<ListKey, string> = {
    groceries: crypto.randomUUID(),
    bbq: crypto.randomUUID(),
    hardware: crypto.randomUUID(),
    drugstore: crypto.randomUUID(),
  };
  const hoursAgo = (hours: number) => now.subtract({ hours });
  const minutesAgo = (minutes: number) => now.subtract({ minutes });
  const daysAgo = (days: number) => today.subtract({ days });
  const { you, noor, sam } = people;

  const item = (
    list: ListKey,
    name: string,
    quantity: string | null,
    addedById: string,
    addedHoursAgo: number,
    checkedById: string | null = null,
  ) => ({
    listId: listIds[list],
    name,
    quantity,
    addedById,
    checkedById,
    checkedAt: checkedById ? minutesAgo(5) : null,
    createdAt: hoursAgo(addedHoursAgo),
  });

  return {
    lists: [
      { id: listIds.groceries, name: "Groceries" },
      { id: listIds.bbq, name: "Saturday BBQ" },
      { id: listIds.hardware, name: "Hardware store" },
      { id: listIds.drugstore, name: "Drugstore" },
    ],
    items: [
      // The oldest unticked item is the one a housemate's turn ticks first
      item("groceries", "Oat milk", "2", you, 22),
      item("groceries", "Bananas", null, sam, 20),
      item("groceries", "Cherry tomatoes", null, sam, 18),
      item("groceries", "Sourdough", null, noor, 9, noor),
      item("groceries", "Avocados", "3", noor, 8),
      item("groceries", "Spinach", null, you, 7),
      item("groceries", "Lemons", "2", noor, 7),
      item("groceries", "Eggs", "12", sam, 6, noor),
      item("groceries", "Greek yoghurt", null, you, 6, noor),
      item("groceries", "Hummus", null, noor, 5),
      item("groceries", "Cheddar", null, sam, 4),
      item("groceries", "Pasta", "2", you, 4),
      item("groceries", "Frozen peas", null, sam, 3),
      item("groceries", "Coffee", null, noor, 3),
      item("groceries", "Dark chocolate", null, sam, 2),
      item("groceries", "Sparkling water", "6", you, 2),
      item("groceries", "Toilet paper", null, you, 1),
      item("bbq", "Sausages", "12", sam, 30),
      item("bbq", "Burger buns", "8", sam, 30),
      item("bbq", "Beer", "12", sam, 29),
      item("bbq", "Cucumber", null, noor, 26),
      item("bbq", "Feta", null, noor, 26),
      item("bbq", "Limes", "4", you, 25),
      item("bbq", "Crisps", null, you, 25),
      item("bbq", "Ice cream", null, noor, 24),
      item("hardware", "Light bulbs", "4", sam, 50),
      item("hardware", "Picture hooks", null, you, 48),
      item("hardware", "Bin bags", null, noor, 40),
      item("drugstore", "Sunscreen", null, noor, 34),
      item("drugstore", "Plasters", null, you, 33),
      item("drugstore", "Deodorant", null, sam, 12),
    ],
    purchases: purchaseHistory(listIds, hoursAgo),
    trip: { listId: listIds.groceries, shopperId: noor, startedAt: minutesAgo(12) },
    chores: [
      weekly("Take out the bins", sam, 1, 2),
      weekly("Take the recycling out", noor, 1, 1),
      weekly("Hoover the living room", you, 1, 4),
      weekly("Change the bed sheets", you, 2, 0),
      weekly("Wipe down the fridge", sam, 4, 12),
      {
        id: crypto.randomUUID(),
        name: "Water the plants",
        repeat: { every: 3, unit: "day" },
        dueOn: daysAgo(1),
        assigneeId: null,
        // Last done four days ago, so it's a day overdue
        history: [4, 7, 10, 13, 16, 19, 22].map((days, i) => ({
          completedById: [noor, you, sam][i % 3] ?? you,
          completedOn: daysAgo(days),
          skipped: false,
        })),
      },
      {
        id: crypto.randomUUID(),
        name: "Clean the bathroom",
        repeat: { every: 2, unit: "week" },
        dueOn: today.add({ days: 3 }),
        assigneeId: noor,
        history: [
          { completedById: noor, completedOn: daysAgo(11), skipped: false },
          { completedById: noor, completedOn: daysAgo(25), skipped: true },
          { completedById: sam, completedOn: daysAgo(26), skipped: false },
          { completedById: noor, completedOn: daysAgo(40), skipped: false },
        ],
      },
      oneOff("Defrost the freezer", you, today.add({ days: 10 })),
      oneOff("Pay the energy bill", noor, today.add({ days: 5 })),
      {
        ...oneOff("Descale the kettle", sam, null),
        history: [{ completedById: sam, completedOn: daysAgo(2), skipped: false }],
      },
    ],
    todos: [
      { name: "Book the dentist", notes: null, dueOn: today, doneAt: null },
      { name: "Return the library books", notes: null, dueOn: daysAgo(2), doneAt: null },
      {
        name: "Renew bike insurance",
        notes: "Compare quotes first",
        dueOn: today.add({ days: 6 }),
        doneAt: null,
      },
      { name: "Send Noor the rent split", notes: null, dueOn: null, doneAt: null },
      { name: "Plan Sam's birthday dinner", notes: "He likes Thai", dueOn: null, doneAt: null },
      { name: "Cancel the gym trial", notes: null, dueOn: null, doneAt: hoursAgo(26) },
    ],
  };

  /**
   * A chore repeating every `every` weeks, done on time by its assignee (once by someone else),
   * due `dueInDays` from today
   */
  function weekly(
    name: string,
    assigneeId: string,
    every: number,
    dueInDays: number,
  ): DemoSeed["chores"][number] {
    const period = 7 * every;
    const lastDone = period - dueInDays;
    const helper = [you, noor, sam].find((id) => id !== assigneeId) ?? you;
    return {
      id: crypto.randomUUID(),
      name,
      repeat: { every, unit: "week" },
      dueOn: today.add({ days: dueInDays }),
      assigneeId,
      history: [0, 1, 2, 3, 4]
        .map((n) => ({
          completedById: n === 2 ? helper : assigneeId,
          completedOn: daysAgo(lastDone + n * period),
          skipped: false,
        }))
        .filter(
          (entry) => Temporal.PlainDate.compare(entry.completedOn, daysAgo(HISTORY_DAYS)) > 0,
        ),
    };
  }
}

/** A chore done once, or not yet */
function oneOff(
  name: string,
  assigneeId: string,
  dueOn: Temporal.PlainDate | null,
): DemoSeed["chores"][number] {
  return { id: crypto.randomUUID(), name, repeat: null, dueOn, assigneeId, history: [] };
}

/**
 * Two months of shopping trips: every few days someone shops, and each trip buys the usuals that
 * have run out by then, so items bought together show up as bought together
 */
function purchaseHistory(
  listIds: Record<ListKey, string>,
  hoursAgo: (hours: number) => Temporal.Instant,
): DemoSeed["purchases"] {
  const lastBought = new Map<string, number>();
  const purchases: DemoSeed["purchases"] = [];
  let day = HISTORY_DAYS;
  for (let trip = 0; day > 0; trip++) {
    for (const [index, usual] of USUALS.entries()) {
      const last = lastBought.get(usual.name);
      // Staggered at the start, so not everything is bought on the first trip
      const due = last === undefined ? index % 3 === trip % 3 : last - day >= usual.everyDays;
      if (!due) continue;
      lastBought.set(usual.name, day);
      purchases.push({
        listId: listIds[usual.list],
        name: usual.name,
        quantity: usual.quantity,
        // Around midday, a minute or so apart, as items are ticked off along the aisles
        boughtAt: hoursAgo(day * 24 - 12).add({ minutes: index }),
      });
    }
    day -= TRIP_EVERY_DAYS[trip % TRIP_EVERY_DAYS.length] ?? 4;
  }
  return purchases;
}
