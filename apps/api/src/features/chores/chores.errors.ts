import { AppError } from "../../lib/errors.ts";

export const choreNotFound = () =>
  new AppError("not_found", "CHORE_NOT_FOUND", "This chore doesn't exist anymore.");

export const assigneeNotMember = () =>
  new AppError(
    "bad_request",
    "ASSIGNEE_NOT_MEMBER",
    "That person isn't in your household anymore. Pick someone else.",
  );

export const dueDateRequired = () =>
  new AppError("bad_request", "DUE_DATE_REQUIRED", "Pick when a repeating chore is next due.");

export const implausibleToday = () =>
  new AppError(
    "bad_request",
    "INVALID_TODAY",
    "Your device's date looks wrong. Check its date settings and try again.",
  );

export const notRepeating = () =>
  new AppError(
    "bad_request",
    "CHORE_NOT_REPEATING",
    "Only repeating chores can be skipped. Change its date instead.",
  );

export const nothingToUndo = () =>
  new AppError("conflict", "NOTHING_TO_UNDO", "There's nothing to undo for this chore.");

export const choreLimitReached = () =>
  new AppError(
    "conflict",
    "CHORE_LIMIT_REACHED",
    "That's as many chores as a household can have. Delete one first.",
  );
