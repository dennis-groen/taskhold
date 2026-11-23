// HTTP layer for chore reminders: validates input, calls the service, picks status codes.
import { validate } from "../../lib/validation.ts";
import { protectedRouter } from "../auth/auth.middleware.ts";
import * as remindersService from "./reminders.service.ts";
import { settingsBody, subscribeBody, unsubscribeBody } from "./reminders.schema.ts";

export const reminderRoutes = protectedRouter()
  .get("/", async (c) => {
    return c.json(await remindersService.getStatus(c.get("user").id), 200);
  })
  .put("/subscription", validate("json", subscribeBody), async (c) => {
    await remindersService.subscribe(c.get("user").id, c.req.valid("json"));
    return c.json(await remindersService.getStatus(c.get("user").id), 200);
  })
  .delete("/subscription", validate("json", unsubscribeBody), async (c) => {
    await remindersService.unsubscribe(c.get("user").id, c.req.valid("json").endpoint);
    return c.body(null, 204);
  })
  .patch("/settings", validate("json", settingsBody), async (c) => {
    await remindersService.updateSettings(c.get("user").id, c.req.valid("json"));
    return c.json(await remindersService.getStatus(c.get("user").id), 200);
  })
  .post("/test", async (c) => {
    const sent = await remindersService.sendTest(c.get("user").id);
    return c.json({ sent }, 200);
  });
