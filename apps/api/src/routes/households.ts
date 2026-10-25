import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import {
  createHousehold,
  findHouseholdByInviteCode,
  findMembership,
  getHouseholdDetail,
  joinHousehold,
} from "../households.ts";
import { ApiError } from "../lib/errors.ts";
import { normalizeInviteCode } from "../lib/invite-code.ts";
import type { AuthEnv } from "../middleware/require-auth.ts";

const createHouseholdBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your household a name.")
    .max(60, "Keep the name under 60 characters."),
});

const inviteNotFound = () =>
  new ApiError(
    404,
    "INVITE_NOT_FOUND",
    "No household uses this code. Check it with the person who shared it.",
  );

async function householdForCode(rawCode: string) {
  const code = normalizeInviteCode(rawCode);
  const invited = code ? await findHouseholdByInviteCode(code) : null;
  if (!invited) throw inviteNotFound();
  return invited;
}

// Mounted after requireAuth, so every route here has a signed-in user.
// Errors are thrown as ApiError and turned into JSON by the app's onError.
export const householdRoutes = new Hono<AuthEnv>()
  .get("/household", async (c) => {
    const membership = await findMembership(c.get("user").id);
    if (!membership) {
      throw new ApiError(404, "NOT_IN_HOUSEHOLD", "You haven't joined a household yet.");
    }
    return c.json({ household: await getHouseholdDetail(membership.id) }, 200);
  })
  .post(
    "/households",
    zValidator("json", createHouseholdBody, (result, c) =>
      result.success
        ? undefined
        : c.json(
            {
              error: {
                code: "INVALID_REQUEST",
                message: result.error.issues[0]?.message ?? "Check the household name.",
              },
            },
            400,
          ),
    ),
    async (c) => {
      const householdId = await createHousehold(c.get("user").id, c.req.valid("json").name);
      return c.json({ household: await getHouseholdDetail(householdId) }, 201);
    },
  )
  .get("/invites/:code", async (c) => {
    const invited = await householdForCode(c.req.param("code"));
    return c.json({ invite: { householdName: invited.name, members: invited.members } }, 200);
  })
  .post("/invites/:code/accept", async (c) => {
    const invited = await householdForCode(c.req.param("code"));
    await joinHousehold(c.get("user").id, invited.id);
    return c.json({ household: await getHouseholdDetail(invited.id) }, 200);
  });
