import { AppError } from "../../lib/errors.ts";

export const listNotFound = () =>
  new AppError("not_found", "LIST_NOT_FOUND", "This list doesn't exist anymore.");

export const itemNotFound = () =>
  new AppError("not_found", "ITEM_NOT_FOUND", "This item isn't on the list anymore.");

export const itemIdTaken = () =>
  new AppError("conflict", "ITEM_ID_TAKEN", "Another item already uses this id.");

export const listLimitReached = () =>
  new AppError(
    "conflict",
    "LIST_LIMIT_REACHED",
    "That's as many lists as a household can have. Delete one first.",
  );

export const itemLimitReached = () =>
  new AppError(
    "conflict",
    "ITEM_LIMIT_REACHED",
    "This list is full. Clear what's been bought first.",
  );
