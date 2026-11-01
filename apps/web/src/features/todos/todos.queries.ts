import { queryOptions } from "@tanstack/react-query";

import { fetchTodos } from "./todos.api.ts";

export const todoKeys = {
  all: ["todos"] as const,
  list: () => [...todoKeys.all, "list"] as const,
};

// Private, so nobody else changes them: no polling. React Query still refetches when the window
// gets focus, which covers the same person using another device.
export const todosQuery = () =>
  queryOptions({
    queryKey: todoKeys.list(),
    queryFn: fetchTodos,
  });
