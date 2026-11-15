import { AppError } from "../../lib/errors.ts";

export const todoNotFound = () =>
  new AppError("not_found", "TODO_NOT_FOUND", "This to-do doesn't exist anymore.");

export const todoIdTaken = () =>
  new AppError("conflict", "TODO_ID_TAKEN", "Another to-do already uses this id.");

export const todoLimitReached = () =>
  new AppError(
    "conflict",
    "TODO_LIMIT_REACHED",
    "That's as many to-dos as you can have. Clear the done ones first.",
  );
