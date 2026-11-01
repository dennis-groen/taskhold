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

export const ownerOnly = () =>
  new AppError("forbidden", "OWNER_ONLY", "Only the household owner can do this.");

export const cannotRemoveSelf = () =>
  new AppError(
    "bad_request",
    "CANNOT_REMOVE_SELF",
    "You can't remove yourself. Leave the household instead.",
  );

export const memberNotFound = () =>
  new AppError("not_found", "MEMBER_NOT_FOUND", "This person isn't in your household.");

export const tooManyInviteAttempts = () =>
  new AppError(
    "too_many_requests",
    "TOO_MANY_INVITE_ATTEMPTS",
    "Too many codes didn't match. Wait 15 minutes, then check the code with the person who shared it.",
  );
