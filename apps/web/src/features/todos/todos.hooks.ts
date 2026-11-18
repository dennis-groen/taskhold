import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { refetchArea, useChange } from "@/lib/offline-changes.ts";

import type { TodoInput } from "./todos.api.ts";
import { todoChanges } from "./todos.changes.ts";
import { todosQuery } from "./todos.queries.ts";

/**
 * The viewer's private to-dos, plus every change to them. Changes show on screen straight away
 * and are rolled back if the API rejects them (see todos.changes.ts).
 */
export function useTodos() {
  const { data: todos } = useSuspenseQuery(todosQuery());
  const queryClient = useQueryClient();
  const add = useChange(todoChanges.add);
  const update = useChange(todoChanges.update);
  const edit = useChange(todoChanges.edit);
  const remove = useChange(todoChanges.remove);
  const clearDone = useChange(todoChanges.clearDone);
  const moveToChores = useChange(todoChanges.moveToChores);

  return {
    todos,
    add: (input: TodoInput) => add.run({ ...input, id: crypto.randomUUID() }),
    /** Resolves once saved, for forms that close afterwards; rejects when saving failed */
    save: (id: string, changes: Partial<TodoInput>) => edit.runAsync({ id, ...changes }),
    setDone: (id: string, done: boolean) => update.run({ id, done }),
    remove: (id: string) => {
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) return;
      remove.run(id, { message: `${todo.name} deleted` });
    },
    /**
     * Makes it a household chore: gone from the to-dos straight away, and sent once there is a
     * connection. A failure brings it back with a notice.
     */
    moveToChores: (id: string) => {
      moveToChores
        .runAsync(id)
        // The household's chores now have it; the live update may not come (no live connection)
        .then(() => refetchArea(queryClient, "chores"))
        .catch(() => {});
    },
    clearDone: () => {
      const count = todos.filter((todo) => todo.done).length;
      if (count === 0) return;
      clearDone.run(null, {
        message: count === 1 ? "1 to-do cleared" : `${count} to-dos cleared`,
      });
    },
  };
}
