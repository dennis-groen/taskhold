import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { changeFailed } from "@/lib/feedback.ts";
import { resumable, type ChangeMeta } from "@/lib/offline-cache.ts";

import {
  clearDoneTodos,
  createTodo,
  deleteTodo,
  updateTodo,
  type Todo,
  type TodoInput,
} from "./todos.api.ts";
import { todoKeys, todosQuery } from "./todos.queries.ts";

// Every change starts with this key, so we know when the last one finishes
const changeKey = [...todoKeys.all, "change"] as const;

export type TodoChanges = Partial<TodoInput> & { id: string; done?: boolean };

/**
 * Every change to the viewer's to-dos. Each shows on screen straight away and is rolled back if
 * the API rejects it.
 *
 * These are also the query client's mutation defaults (registerTodoMutations), so a change that
 * was waiting for a connection when the app closed is sent once it opens again. Everything a
 * change needs travels in its variables, which are saved with it.
 */
export function todoMutations(queryClient: QueryClient) {
  function todoChange<Vars>(
    name: string,
    {
      idempotent,
      quiet = false,
      mutationFn,
      apply,
    }: {
      /** Sending it twice does the same as once (see ChangeMeta) */
      idempotent: boolean;
      /** The caller reports failures itself */
      quiet?: boolean;
      mutationFn: (vars: Vars) => Promise<unknown>;
      apply: (todos: Todo[], vars: Vars) => Todo[];
    },
  ) {
    return mutationOptions({
      mutationKey: [...changeKey, name],
      meta: { idempotent } satisfies ChangeMeta,
      mutationFn,
      onMutate: async (vars: Vars) => {
        const { queryKey } = todosQuery();
        // A refetch that's already on its way would overwrite the optimistic change with older data
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey);
        queryClient.setQueryData(queryKey, (list) => list && apply(list, vars));
        return { previous };
      },
      onError: (err, _vars, context) => {
        if (context?.previous) queryClient.setQueryData(todosQuery().queryKey, context.previous);
        if (!quiet)
          changeFailed(err, "Couldn't save that change. Check your connection and try again.");
      },
      onSettled: () => refetchAfterLastChange(queryClient),
    });
  }

  const update = {
    idempotent: true,
    mutationFn: ({ id, ...changes }: TodoChanges) => updateTodo(id, changes),
    apply: (list: Todo[], { id, ...changes }: TodoChanges) =>
      list.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              ...changes,
              ...(changes.done !== undefined && {
                doneAt: changes.done ? Temporal.Now.instant().toString() : null,
              }),
            }
          : todo,
      ),
  };

  return {
    // The id comes from the app, so the API ignores a second copy
    add: todoChange("add", {
      idempotent: true,
      mutationFn: (input: TodoInput & { id: string }) => createTodo(input),
      apply: (list, input) => [
        ...list,
        {
          ...input,
          done: false,
          doneAt: null,
          createdAt: Temporal.Now.instant().toString(),
        },
      ],
    }),

    update: todoChange("update", update),
    // Edits come from a form that shows its own error
    edit: todoChange("edit", { ...update, quiet: true }),

    // A second delete fails, as the to-do is gone
    remove: todoChange("remove", {
      idempotent: false,
      mutationFn: (id: string) => deleteTodo(id),
      apply: (list, id) => list.filter((todo) => todo.id !== id),
    }),

    clearDone: todoChange("clear-done", {
      idempotent: true,
      mutationFn: (_vars: null) => clearDoneTodos(),
      apply: (list) => list.filter((todo) => !todo.done),
    }),

    // Brings deleted to-dos back as they were, with the same ids
    restore: todoChange("restore", {
      idempotent: true,
      mutationFn: async (removed: Todo[]) => {
        for (const { id, name, notes, dueOn, done } of removed) {
          await createTodo({ id, name, notes, dueOn });
          if (done) await updateTodo(id, { done });
        }
      },
      apply: (list, removed) => [...list, ...removed],
    }),
  };
}

/** Lets changes saved on the device run after a restart, when no page has set them up yet */
export function registerTodoMutations(queryClient: QueryClient): void {
  const changes = todoMutations(queryClient);
  resumable(queryClient, changes.add);
  resumable(queryClient, changes.update);
  resumable(queryClient, changes.edit);
  resumable(queryClient, changes.remove);
  resumable(queryClient, changes.clearDone);
  resumable(queryClient, changes.restore);
}

/**
 * Refetches after the last of several quick changes, so an early response can't undo a later one.
 * Not awaited: the change would count as running until the refetch ends.
 */
function refetchAfterLastChange(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: changeKey }) === 1) {
    void queryClient.invalidateQueries({ queryKey: todoKeys.all });
  }
}
