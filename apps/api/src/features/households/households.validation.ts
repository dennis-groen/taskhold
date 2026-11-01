import { createInsertSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { household } from "./households.schema.ts";

export const createHouseholdBody = createInsertSchema(household, {
  name: (schema) =>
    schema
      .trim()
      .min(1, "Give your household a name.")
      .max(60, "Keep the name under 60 characters."),
}).pick({ name: true });

export const inviteCodeParam = z.object({
  code: z.string().min(1).max(64),
});

export const memberParam = z.object({
  userId: z.string().min(1).max(64),
});

export type CreateHouseholdInput = z.output<typeof createHouseholdBody>;
