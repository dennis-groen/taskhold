import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { offerUndo } from "@/lib/feedback.ts";

import type { Todo, TodoInput } from "../todos.api.ts";
import { todoMutations } from "../todos.mutations.ts";
import { todosQuery } from "../todos.queries.ts";

/**
 * The viewer's private to-dos, plus every change to them. Changes show on screen straight away
 * and are rolled back if the API rejects them (see todos.mutations.ts).
 */
export function useTodos() {
  const { data: todos } = useSuspenseQuery(todosQuery());
  const mutations = todoMutations(useQueryClient());
  const add = useMutation(mutations.add);
  const update = useMutation(mutations.update);
  const edit = useMutation(mutations.edit);

  // Deletes and the undos that bring to-dos back run one after another, so an undo can't reach
  // the API before the delete it undoes
  const removals = { id: "todo-removals" };
  const remove = useMutation({ ...mutations.remove, scope: removals });
  const clearDone = useMutation({ ...mutations.clearDone, scope: removals });
  const restore = useMutation({ ...mutations.restore, scope: removals });

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
