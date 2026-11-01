import { createFileRoute } from "@tanstack/react-router";

import { TodosPage } from "@/features/todos/pages/todos-page.tsx";
import { todosQuery } from "@/features/todos/todos.queries.ts";

export const Route = createFileRoute("/_household/personal/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(todosQuery()),
  component: TodosPage,
});
