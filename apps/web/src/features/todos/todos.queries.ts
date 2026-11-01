import { queryOptions } from "@tanstack/react-query";

import { fetchTodos } from "./todos.api.ts";

export const todoKeys = {
  all: ["todos"] as const,
  list: () => [...todoKeys.all, "list"] as const,
};

// Private, so nobody else changes them: no polling. Changes from the same person's other devices
// arrive through live updates, and React Query refetches when the window gets focus.
export const todosQuery = () =>
  queryOptions({
    queryKey: todoKeys.list(),
    queryFn: fetchTodos,
  });
