// HTTP layer for chores: validates input, calls the service, picks status codes.
import { validate } from "../../lib/validation.ts";
import { protectedRouter } from "../auth/auth.middleware.ts";
import * as choresService from "./chores.service.ts";
import {
  choreParam,
  completeChoreBody,
  createChoreBody,
  updateChoreBody,
} from "./chores.validation.ts";

export const choreRoutes = protectedRouter()
  .get("/", async (c) => {
    const chores = await choresService.getChores(c.get("user").id);
    return c.json({ chores }, 200);
  })
  .post("/", validate("json", createChoreBody), async (c) => {
    const chore = await choresService.createChore(c.get("user").id, c.req.valid("json"));
    return c.json({ chore }, 201);
  })
  // Registered before /:choreId so "clear-done" isn't read as a chore id
  .post("/clear-done", async (c) => {
    const removed = await choresService.clearDoneChores(c.get("user").id);
    return c.json({ removed }, 200);
  })
  .get("/:choreId", validate("param", choreParam), async (c) => {
    const { choreId } = c.req.valid("param");
    const chore = await choresService.getChore(c.get("user").id, choreId);
    return c.json({ chore }, 200);
  })
  .patch(
    "/:choreId",
    validate("param", choreParam),
    validate("json", updateChoreBody),
    async (c) => {
      const { choreId } = c.req.valid("param");
      const chore = await choresService.updateChore(c.get("user").id, choreId, c.req.valid("json"));
      return c.json({ chore }, 200);
    },
  )
  .delete("/:choreId", validate("param", choreParam), async (c) => {
    const { choreId } = c.req.valid("param");
    await choresService.deleteChore(c.get("user").id, choreId);
    return c.body(null, 204);
  })
  .post(
    "/:choreId/complete",
    validate("param", choreParam),
    validate("json", completeChoreBody),
    async (c) => {
      const { choreId } = c.req.valid("param");
      const chore = await choresService.completeChore(
        c.get("user").id,
        choreId,
        c.req.valid("json").today,
      );
      return c.json({ chore }, 200);
    },
  )
  .post("/:choreId/undo", validate("param", choreParam), async (c) => {
    const { choreId } = c.req.valid("param");
    const chore = await choresService.undoLastCompletion(c.get("user").id, choreId);
    return c.json({ chore }, 200);
  });
