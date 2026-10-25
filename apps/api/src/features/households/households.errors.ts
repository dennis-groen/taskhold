import { AppError } from "../../lib/errors.ts";

export const notInHousehold = () =>
  new AppError("not_found", "NOT_IN_HOUSEHOLD", "You haven't joined a household yet.");

export const alreadyInHousehold = () =>
  new AppError("conflict", "ALREADY_IN_HOUSEHOLD", "You're already in a household.");

export const inviteNotFound = () =>
  new AppError(
    "not_found",
    "INVITE_NOT_FOUND",
    "No household uses this code. Check it with the person who shared it.",
  );
