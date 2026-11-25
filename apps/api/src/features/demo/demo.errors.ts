import { AppError } from "../../lib/errors.ts";

export const demoOff = () =>
  new AppError("not_found", "DEMO_OFF", "There's no demo here. Sign in with Google instead.");

export const demoFull = () =>
  new AppError(
    "unavailable",
    "DEMO_FULL",
    "The demo is busy right now. Try again in a little while, or sign in with Google.",
  );

export const tooManyDemos = () =>
  new AppError(
    "too_many_requests",
    "TOO_MANY_DEMOS",
    "There are already several demos running from your network. End one, or sign in with Google.",
  );

export const demoBudgetSpent = () =>
  new AppError(
    "too_many_requests",
    "DEMO_BUDGET_SPENT",
    "This demo has taken all the changes it can. End it and start a fresh one, or sign in with Google.",
  );

export const alreadyInDemo = () =>
  new AppError("conflict", "ALREADY_IN_DEMO", "You're already in the demo.");

export const notInDemo = () =>
  new AppError("not_found", "NOT_IN_DEMO", "This only works in the demo.");
