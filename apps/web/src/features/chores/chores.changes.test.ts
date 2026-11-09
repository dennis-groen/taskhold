// What chore changes do to the list. Showing, rolling back, ordering and keeping changes on the
// device are lib/offline-changes.ts's, and tested there.
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { offerUndo } from "@/lib/feedback.ts";
import { registerChanges, runChange } from "@/lib/offline-changes.ts";

import type { Chore } from "./chores.api.ts";
import { choreChanges } from "./chores.changes.ts";
import { choresQuery } from "./chores.queries.ts";

const api = vi.hoisted(() => ({
  completeChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  skipChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  undoCompletion: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateChore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
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

/** A request that answers when the test says so */
function deferred() {
  const answer = { resolve: (_value: unknown) => {} };
  const promise = new Promise<unknown>((resolve) => {
    answer.resolve = resolve;
  });
  return { promise, resolve: (value: unknown) => answer.resolve(value) };
}
