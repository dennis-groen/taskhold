import { AppError } from "../../lib/errors.ts";

export const remindersUnavailable = () =>
  new AppError("unavailable", "REMINDERS_UNAVAILABLE", "Reminders aren't set up on this server.");

export const remindersOff = () =>
  new AppError("conflict", "REMINDERS_OFF", "Turn reminders on first.");

export const noReminderDevices = () =>
  new AppError(
    "conflict",
    "NO_REMINDER_DEVICES",
    "No device gets reminders yet. Turn them on first.",
  );
