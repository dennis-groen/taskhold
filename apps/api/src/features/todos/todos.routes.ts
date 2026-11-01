// HTTP layer for private to-dos: validates input, calls the service, picks status codes.
import { validate } from "../../lib/validation.ts";
import { protectedRouter } from "../auth/auth.middleware.ts";
import * as todosService from "./todos.service.ts";
import { createTodoBody, todoParam, updateTodoBody } from "./todos.validation.ts";

export const todoRoutes = protectedRouter()
  .get("/", async (c) => {
    const todos = await todosService.getTodos(c.get("user").id);
    return c.json({ todos }, 200);
  })
  .post("/", validate("json", createTodoBody), async (c) => {
    const todo = await todosService.createTodo(c.get("user").id, c.req.valid("json"));
    return c.json({ todo }, 201);
  })
  // Registered before /:todoId so "clear-done" isn't read as a to-do id
  .post("/clear-done", async (c) => {
    const removed = await todosService.clearDoneTodos(c.get("user").id);
    return c.json({ removed }, 200);
  })
  .patch("/:todoId", validate("param", todoParam), validate("json", updateTodoBody), async (c) => {
    const { todoId } = c.req.valid("param");
    const todo = await todosService.updateTodo(c.get("user").id, todoId, c.req.valid("json"));
    return c.json({ todo }, 200);
  })
  .delete("/:todoId", validate("param", todoParam), async (c) => {
    const { todoId } = c.req.valid("param");
    await todosService.deleteTodo(c.get("user").id, todoId);
    return c.body(null, 204);
  })
  .post("/:todoId/move-to-chores", validate("param", todoParam), async (c) => {
    const { todoId } = c.req.valid("param");
    const chore = await todosService.moveToChores(c.get("user").id, todoId);
    return c.json({ chore }, 201);
  });
