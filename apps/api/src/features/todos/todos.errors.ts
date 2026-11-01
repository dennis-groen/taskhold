import { AppError } from "../../lib/errors.ts";

export const todoNotFound = () =>
  new AppError("not_found", "TODO_NOT_FOUND", "This to-do doesn't exist anymore.");

export const todoIdTaken = () =>
  new AppError("conflict", "TODO_ID_TAKEN", "Another to-do already uses this id.");
