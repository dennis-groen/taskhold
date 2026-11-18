// What chore changes do to the list. Showing, rolling back, ordering and keeping changes on the
// device are lib/offline-changes.ts's, and tested there.
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { changeFailed, offerUndo } from "@/lib/feedback.ts";
import { registerChanges, runChange } from "@/lib/offline-changes.ts";

import type { Chore } from "./chores.api.ts";
import { choreChanges } from "./chores.changes.ts";
import { choresQuery } from "./chores.queries.ts";

const api = vi.hoisted(() => ({
  completeChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  skipChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  undoCompletion: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  clearDoneChores: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("./chores.api.ts", () => ({ ...api, fetchChores: vi.fn(), fetchChore: vi.fn() }));
vi.mock("@/lib/feedback.ts", () => ({ changeFailed: vi.fn(), offerUndo: vi.fn() }));

const me = { id: "me", name: "Me" };
const bins: Chore = {
  id: "bins",
  name: "Bins out",
  repeat: { every: 1, unit: "week" },
  dueOn: "2026-11-09",
  assignee: null,
  lastCompletion: null,
  done: false,
};

function appClient(chores: Chore[] = [bins]) {
  const queryClient = new QueryClient();
  registerChanges(queryClient, choreChanges);
  queryClient.setQueryData(choresQuery().queryKey, chores);
  return queryClient;
}

function shown(queryClient: QueryClient) {
  return queryClient.getQueryData(choresQuery().queryKey)?.[0];
}

function tapUndo() {
  const onUndo = vi.mocked(offerUndo).mock.lastCall?.[1];
  if (!onUndo) throw new Error("No Undo was offered");
  onUndo();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("marking a chore done", () => {
  it("moves a repeating chore on straight away, and Undo takes it back", async () => {
    const queryClient = appClient();
    api.completeChore.mockResolvedValue({});
    api.undoCompletion.mockResolvedValue({ ...bins, history: [] });
    const done = { choreId: "bins", on: "2026-11-09", by: me };

    await runChange(queryClient, choreChanges.complete, done, { message: "Bins out done." });
    expect(shown(queryClient)?.dueOn).toBe("2026-11-16");
    expect(api.completeChore).toHaveBeenCalledExactlyOnceWith("bins", "2026-11-09");

    tapUndo();
    await vi.waitFor(() => expect(shown(queryClient)?.dueOn).toBe("2026-11-09"));
    expect(api.undoCompletion).toHaveBeenCalledExactlyOnceWith("bins");
  });

  it("offers no Undo when it was done already today, which would take back that time", async () => {
    const doneToday: Chore = {
      ...bins,
      dueOn: "2026-11-16",
      lastCompletion: {
        id: "earlier",
        completedBy: me,
        completedOn: "2026-11-09",
        skipped: false,
        createdAt: "2026-11-09T08:00:00Z",
      },
    };
    const queryClient = appClient([doneToday]);
    api.completeChore.mockResolvedValue({});

    await runChange(
      queryClient,
      choreChanges.complete,
      { choreId: "bins", on: "2026-11-09", by: me },
      { message: "Bins out done." },
    );
    expect(offerUndo).not.toHaveBeenCalled();
  });
});

describe("putting a chore off", () => {
  it("moves it to tomorrow straight away, and Undo puts the old date back", async () => {
    const queryClient = appClient();
    api.updateChore.mockResolvedValue({});

    await runChange(
      queryClient,
      choreChanges.putOff,
      { choreId: "bins", dueOn: "2026-11-10" },
      { message: "Bins out moved to tomorrow." },
    );
    expect(shown(queryClient)?.dueOn).toBe("2026-11-10");

    tapUndo();
    await vi.waitFor(() =>
      expect(api.updateChore).toHaveBeenLastCalledWith("bins", { dueOn: "2026-11-09" }),
    );
    expect(shown(queryClient)?.dueOn).toBe("2026-11-09");
  });

  it("shows a skip straight away, by the API's own rule, and keeps the API's answer", async () => {
    const queryClient = appClient([{ ...bins, dueOn: "2026-11-05" }]);
    const answer = deferred();
    api.skipChore.mockReturnValue(answer.promise);

    const sent = runChange(queryClient, choreChanges.skip, {
      choreId: "bins",
      today: "2026-11-09",
      by: me,
    });
    // Overdue, so it moves a week on from today, not from its due date
    await vi.waitFor(() => expect(shown(queryClient)?.dueOn).toBe("2026-11-16"));
    expect(shown(queryClient)?.lastCompletion).toMatchObject({ skipped: true, completedBy: me });
    expect(shown(queryClient)?.done).toBe(false);
    expect(api.skipChore).toHaveBeenCalledExactlyOnceWith("bins", "2026-11-09");

    const saved = { ...bins, dueOn: "2026-11-16", history: [] };
    answer.resolve(saved);
    await sent;
    expect(shown(queryClient)).toEqual({ ...bins, dueOn: "2026-11-16" });
  });
});

describe("adding a chore", () => {
  it("shows it straight away and sends it with the app's id", async () => {
    const queryClient = appClient([]);
    api.createChore.mockResolvedValue({});
    const added = {
      id: "new-chore",
      name: "Water the plants",
      repeat: null,
      dueOn: "2026-11-12",
      assigneeId: "me",
      assignee: { id: "me", name: "Me", image: null },
    };

    await runChange(queryClient, choreChanges.add, added);

    expect(shown(queryClient)).toMatchObject({
      id: "new-chore",
      name: "Water the plants",
      assignee: { id: "me", name: "Me" },
      lastCompletion: null,
      done: false,
    });
    expect(api.createChore).toHaveBeenCalledExactlyOnceWith({
      id: "new-chore",
      name: "Water the plants",
      repeat: null,
      dueOn: "2026-11-12",
      assigneeId: "me",
    });
  });
});

describe("editing a chore", () => {
  it("shows the change, and sends only the fields that changed", async () => {
    const queryClient = appClient();
    api.updateChore.mockResolvedValue({});

    await runChange(queryClient, choreChanges.edit, {
      choreId: "bins",
      changes: { name: "Bins and recycling", assigneeId: "me" },
      assignee: { id: "me", name: "Me", image: null },
    });

    expect(shown(queryClient)).toMatchObject({
      name: "Bins and recycling",
      dueOn: "2026-11-09",
      assignee: { id: "me" },
    });
    expect(api.updateChore).toHaveBeenCalledExactlyOnceWith("bins", {
      name: "Bins and recycling",
      assigneeId: "me",
    });
  });

  it("starts a chore that stops repeating as not done, like the API does", async () => {
    const withHistory: Chore = {
      ...bins,
      lastCompletion: {
        id: "earlier",
        completedBy: me,
        completedOn: "2026-11-01",
        skipped: false,
        createdAt: "2026-11-01T08:00:00Z",
      },
    };
    const queryClient = appClient([withHistory]);
    api.updateChore.mockResolvedValue({});

    await runChange(queryClient, choreChanges.edit, { choreId: "bins", changes: { repeat: null } });

    expect(shown(queryClient)).toMatchObject({ repeat: null, lastCompletion: null, done: false });
  });

  it("rolls a failed edit back with a notice, as its sheet has closed", async () => {
    const queryClient = appClient();
    api.updateChore.mockRejectedValue(new Error("Nope"));

    await expect(
      runChange(queryClient, choreChanges.edit, { choreId: "bins", changes: { name: "x" } }),
    ).rejects.toThrow("Nope");
    expect(changeFailed).toHaveBeenCalledOnce();
    expect(shown(queryClient)?.name).toBe("Bins out");
  });
});

describe("deleting chores", () => {
  it("removes a chore straight away and sends the delete", async () => {
    const queryClient = appClient();
    api.deleteChore.mockResolvedValue({});

    await runChange(queryClient, choreChanges.remove, "bins");

    expect(shown(queryClient)).toBeUndefined();
    expect(api.deleteChore).toHaveBeenCalledExactlyOnceWith("bins");
  });

  it("clears the chores that are done and leaves the rest", async () => {
    const done: Chore = { ...bins, id: "tap", name: "Fix tap", repeat: null, done: true };
    const queryClient = appClient([bins, done]);
    api.clearDoneChores.mockResolvedValue({});

    await runChange(queryClient, choreChanges.clearDone, null);

    expect(queryClient.getQueryData(choresQuery().queryKey)?.map((chore) => chore.id)).toEqual([
      "bins",
    ]);
    expect(api.clearDoneChores).toHaveBeenCalledOnce();
  });

  it("runs the writes in order with the other changes", () => {
    for (const change of [
      choreChanges.add,
      choreChanges.edit,
      choreChanges.remove,
      choreChanges.clearDone,
    ]) {
      expect(change.ordered).toBe(true);
    }
  });
});

/** A request that answers when the test says so */
function deferred() {
  const answer = { resolve: (_value: unknown) => {} };
  const promise = new Promise<unknown>((resolve) => {
    answer.resolve = resolve;
  });
  return { promise, resolve: (value: unknown) => answer.resolve(value) };
}
