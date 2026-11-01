import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { errorMessage } from "@/lib/api-client.ts";

import {
  clearDoneTodos,
  createTodo,
  deleteTodo,
  updateTodo,
  type Todo,
  type TodoInput,
} from "../todos.api.ts";
import { todoKeys, todosQuery } from "../todos.queries.ts";

// Shared by every change, so we know when the last one finishes
const changeKey = [...todoKeys.all, "change"];

/**
 * The viewer's private to-dos, plus every change to them. Changes show on screen straight away
 * and are rolled back if the API rejects them.
 */
export function useTodos() {
  const { data: todos } = useSuspenseQuery(todosQuery());
  const [error, setError] = useState<string | null>(null);
  const callbacks = {
    onStart: () => setError(null),
    onError: (err: unknown) =>
      setError(
        errorMessage(err, "Couldn't save that change. Check your connection and try again."),
      ),
  };

  const add = useTodoChange(callbacks, {
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
  });

  const update = useTodoChange(callbacks, {
    mutationFn: ({ id, ...changes }: Partial<TodoInput> & { id: string; done?: boolean }) =>
      updateTodo(id, changes),
    apply: (list, { id, ...changes }) =>
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
  });

  const remove = useTodoChange(callbacks, {
    mutationFn: (id: string) => deleteTodo(id),
    apply: (list, id) => list.filter((todo) => todo.id !== id),
  });

  const clearDone = useTodoChange(callbacks, {
    mutationFn: (_vars: null) => clearDoneTodos(),
    apply: (list) => list.filter((todo) => !todo.done),
  });

  return {
    todos,
    /** The last change that failed, for people; cleared by the next change */
    error,
    add: (input: TodoInput) => add.mutate({ ...input, id: crypto.randomUUID() }),
    /** Resolves once saved, for forms that close afterwards; rejects when saving failed */
    save: (id: string, changes: Partial<TodoInput>) => update.mutateAsync({ id, ...changes }),
    setDone: (id: string, done: boolean) => update.mutate({ id, done }),
    remove: (id: string) => remove.mutate(id),
    clearDone: () => clearDone.mutate(null),
  };
}

type ChangeCallbacks = { onStart: () => void; onError: (err: unknown) => void };

function useTodoChange<Vars>(
  { onStart, onError }: ChangeCallbacks,
  {
    mutationFn,
    apply,
  }: {
    mutationFn: (vars: Vars) => Promise<unknown>;
    apply: (todos: Todo[], vars: Vars) => Todo[];
  },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: changeKey,
    mutationFn,
    onMutate: async (vars) => {
      onStart();
      const { queryKey } = todosQuery();
      // A refetch that's already on its way would overwrite the optimistic change with older data
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (list) => list && apply(list, vars));
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(todosQuery().queryKey, context.previous);
      onError(err);
    },
    onSettled: () => refetchAfterLastChange(queryClient),
  });
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
