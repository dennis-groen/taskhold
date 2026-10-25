import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

import type { ApiErrorBody } from "./errors.ts";

/**
 * Validates part of the request with a zod schema. Failures return 400 in the
 * standard error shape, with the first issue's message written for people.
 */
export const validate = <Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) =>
    result.success
      ? undefined
      : // `satisfies`, not c.json<T>(): an explicit generic would widen 400 and blur the RPC types
        c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: result.error.issues[0]?.message ?? "Check the request and try again.",
            },
          } satisfies ApiErrorBody,
          400,
        ),
  );
