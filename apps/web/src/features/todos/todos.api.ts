import { api, parseResponse, type InferResponseType } from "@/lib/api.ts";

const todos = api.todos;

export type Todo = InferResponseType<typeof todos.$get, 200>["todos"][number];

export type TodoInput = { name: string; notes: string | null; dueOn: string | null };

export async function fetchTodos(): Promise<Todo[]> {
  return (await parseResponse(todos.$get())).todos;
}

export async function createTodo(input: TodoInput & { id: string }): Promise<Todo> {
  return (await parseResponse(todos.$post({ json: input }))).todo;
}

export async function updateTodo(
  todoId: string,
  changes: Partial<TodoInput> & { done?: boolean },
): Promise<Todo> {
  return (await parseResponse(todos[":todoId"].$patch({ param: { todoId }, json: changes }))).todo;
}

export async function deleteTodo(todoId: string): Promise<void> {
  await parseResponse(todos[":todoId"].$delete({ param: { todoId } }));
}

/** Removes every done to-do */
export async function clearDoneTodos(): Promise<number> {
  return (await parseResponse(todos["clear-done"].$post())).removed;
}

/** Turns the to-do into a one-off household chore and removes it from the list */
export async function moveToChores(todoId: string): Promise<void> {
  await parseResponse(todos[":todoId"]["move-to-chores"].$post({ param: { todoId } }));
}
