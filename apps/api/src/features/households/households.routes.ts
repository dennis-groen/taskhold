// HTTP layer for households: validates input, calls the service, picks status codes.
import { validate } from "../../lib/validation.ts";
import { protectedRouter } from "../auth/auth.middleware.ts";
import * as householdsService from "./households.service.ts";
import { createHouseholdBody, inviteCodeParam } from "./households.validation.ts";

export const householdRoutes = protectedRouter()
  .get("/current", async (c) => {
    const household = await householdsService.getHouseholdOf(c.get("user").id);
    return c.json({ household }, 200);
  })
  .post("/", validate("json", createHouseholdBody), async (c) => {
    const { name } = c.req.valid("json");
    const household = await householdsService.createHousehold(c.get("user").id, name);
    return c.json({ household }, 201);
  })
  .get("/invites/:code", validate("param", inviteCodeParam), async (c) => {
    const invite = await householdsService.previewInvite(c.req.valid("param").code);
    return c.json({ invite }, 200);
  })
  .post("/invites/:code/accept", validate("param", inviteCodeParam), async (c) => {
    const { code } = c.req.valid("param");
    const household = await householdsService.acceptInvite(c.get("user").id, code);
    return c.json({ household }, 200);
  });
