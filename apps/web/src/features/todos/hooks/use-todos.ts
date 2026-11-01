import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { changeFailed, offerUndo } from "@/lib/feedback.ts";

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
  const add = useTodoChange({
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

  const update = useTodoChange(updateOptions);
  // Edits come from a form that shows its own error
  const edit = useTodoChange({ ...updateOptions, quiet: true });

  // Deletes and the undos that bring to-dos back run one after another, so an undo can't reach
  // the API before the delete it undoes
  const removals = { id: "todo-removals" };

  const remove = useTodoChange({
    scope: removals,
    mutationFn: (id: string) => deleteTodo(id),
    apply: (list, id) => list.filter((todo) => todo.id !== id),
  });

  const clearDone = useTodoChange({
    scope: removals,
    mutationFn: (_vars: null) => clearDoneTodos(),
    apply: (list) => list.filter((todo) => !todo.done),
  });

  // Brings deleted to-dos back as they were, with the same ids
  const restore = useTodoChange({
    scope: removals,
    mutationFn: async (removed: Todo[]) => {
      for (const { id, name, notes, dueOn, done } of removed) {
        await createTodo({ id, name, notes, dueOn });
        if (done) await updateTodo(id, { done });
      }
    },
    apply: (list, removed) => [...list, ...removed],
  });

  function offerRestore(removed: Todo[], message: string) {
    offerUndo(message, () => restore.mutate(removed));
  }

  return {
    todos,
    add: (input: TodoInput) => add.mutate({ ...input, id: crypto.randomUUID() }),
    /** Resolves once saved, for forms that close afterwards; rejects when saving failed */
    save: (id: string, changes: Partial<TodoInput>) => edit.mutateAsync({ id, ...changes }),
    setDone: (id: string, done: boolean) => update.mutate({ id, done }),
    remove: (id: string) => {
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) return;
      remove.mutate(id);
      offerRestore([todo], `${todo.name} deleted`);
    },
    clearDone: () => {
      const done = todos.filter((todo) => todo.done);
      if (done.length === 0) return;
      clearDone.mutate(null);
      offerRestore(done, done.length === 1 ? "1 to-do cleared" : `${done.length} to-dos cleared`);
    },
  };
}

const updateOptions = {
  mutationFn: ({ id, ...changes }: Partial<TodoInput> & { id: string; done?: boolean }) =>
    updateTodo(id, changes),
  apply: (list: Todo[], { id, ...changes }: Partial<TodoInput> & { id: string; done?: boolean }) =>
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

function useTodoChange<Vars>({
  scope,
  quiet = false,
  mutationFn,
  apply,
}: {
  scope?: { id: string };
  /** The caller reports failures itself */
  quiet?: boolean;
  mutationFn: (vars: Vars) => Promise<unknown>;
  apply: (todos: Todo[], vars: Vars) => Todo[];
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: changeKey,
    scope,
    mutationFn,
    onMutate: async (vars) => {
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

/**
 * Refetches after the last of several quick changes, so an early response can't undo a later one.
 * Not awaited: the change would count as running until the refetch ends.
 */
function refetchAfterLastChange(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: changeKey }) === 1) {
    void queryClient.invalidateQueries({ queryKey: todoKeys.all });
  }
}
