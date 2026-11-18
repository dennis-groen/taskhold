// What to-do changes do to the list. Showing, rolling back, ordering and keeping changes on the
// device are lib/offline-changes.ts's, and tested there.
import { QueryClient } from "@tanstack/react-query";
import { DetailedError } from "@taskhold/api/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { changeFailed, offerUndo } from "@/lib/feedback.ts";
import { registerChanges, runChange } from "@/lib/offline-changes.ts";

import type { Todo } from "./todos.api.ts";
import { todoChanges } from "./todos.changes.ts";
import { todosQuery } from "./todos.queries.ts";

const api = vi.hoisted(() => ({
  createTodo: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateTodo: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteTodo: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  moveToChores: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("./todos.api.ts", () => ({ ...api, clearDoneTodos: vi.fn(), fetchTodos: vi.fn() }));
vi.mock("@/lib/feedback.ts", () => ({ changeFailed: vi.fn(), offerUndo: vi.fn() }));

const post: Todo = {
  id: "post",
  name: "Post the letter",
  notes: "Stamp in the drawer",
  dueOn: "2026-11-10",
  done: true,
  doneAt: "2026-11-09T10:00:00Z",
  createdAt: "2026-11-08T10:00:00Z",
};

function appClient() {
  const queryClient = new QueryClient();
  registerChanges(queryClient, todoChanges);
  queryClient.setQueryData(todosQuery().queryKey, [post]);
  return queryClient;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.createTodo.mockResolvedValue({});
  api.updateTodo.mockResolvedValue({});
  api.deleteTodo.mockResolvedValue({});
  api.moveToChores.mockResolvedValue({});
});

describe("to-do changes", () => {
  it("runs adds and updates in the order they were made", () => {
    expect(todoChanges.add.ordered).toBe(true);
    expect(todoChanges.update.ordered).toBe(true);
    expect(todoChanges.edit.ordered).toBe(true);
  });

  it("takes away when it was done as soon as it's marked not done", async () => {
    const queryClient = appClient();
    await runChange(queryClient, todoChanges.update, { id: "post", done: false });

    expect(queryClient.getQueryData(todosQuery().queryKey)?.[0]).toMatchObject({
      done: false,
      doneAt: null,
    });
    expect(api.updateTodo).toHaveBeenCalledExactlyOnceWith("post", { done: false });
  });

  it("brings a deleted to-do back as it was, done and all, when someone taps Undo", async () => {
    const queryClient = appClient();
    await runChange(queryClient, todoChanges.remove, "post", { message: "Deleted" });

    vi.mocked(offerUndo).mock.lastCall?.[1]();
    await vi.waitFor(() => expect(api.updateTodo).toHaveBeenCalled());

    expect(api.createTodo).toHaveBeenCalledExactlyOnceWith({
      id: "post",
      name: "Post the letter",
      notes: "Stamp in the drawer",
      dueOn: "2026-11-10",
    });
    expect(api.updateTodo).toHaveBeenCalledExactlyOnceWith("post", { done: true });
  });

  it("rolls a failed edit back with a notice, as its sheet has closed", async () => {
    const queryClient = appClient();
    api.updateTodo.mockRejectedValue(new DetailedError("Too long", { statusCode: 400 }));

    await expect(
      runChange(queryClient, todoChanges.edit, { id: "post", name: "x".repeat(500) }),
    ).rejects.toThrow("Too long");
    expect(changeFailed).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(todosQuery().queryKey)).toEqual([post]);
  });

  it("takes a to-do off the list as it moves to chores, and brings it back if that fails", async () => {
    const queryClient = appClient();
    await runChange(queryClient, todoChanges.moveToChores, "post");
    expect(queryClient.getQueryData(todosQuery().queryKey)).toEqual([]);
    expect(api.moveToChores).toHaveBeenCalledExactlyOnceWith("post");

    const again = appClient();
    api.moveToChores.mockRejectedValueOnce(new Error("NOT_IN_HOUSEHOLD"));
    await expect(runChange(again, todoChanges.moveToChores, "post")).rejects.toThrow();
    expect(again.getQueryData(todosQuery().queryKey)).toEqual([post]);
  });
});
