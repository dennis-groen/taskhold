import { z } from "zod";

export const createHouseholdBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your household a name.")
    .max(60, "Keep the name under 60 characters."),
});

export const inviteCodeParam = z.object({
  code: z.string().min(1).max(64),
});
