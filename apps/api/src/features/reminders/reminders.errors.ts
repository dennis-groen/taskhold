import { AppError } from "../../lib/errors.ts";

export const remindersUnavailable = () =>
  new AppError("unavailable", "REMINDERS_UNAVAILABLE", "Reminders aren't set up on this server.");

export const remindersOff = () =>
  new AppError("conflict", "REMINDERS_OFF", "Turn reminders on first.");

export const testSentRecently = () =>
  new AppError(
    "too_many_requests",
    "TEST_SENT_RECENTLY",
    "A test notification was just sent. Wait a minute before sending another.",
  );

export const noReminderDevices = () =>
  new AppError(
    "conflict",
    "NO_REMINDER_DEVICES",
    "No device gets reminders yet. Turn them on first.",
  );

export const pushDeviceTaken = () =>
  new AppError(
    "conflict",
    "PUSH_DEVICE_TAKEN",
    "This device is set up for someone else. Turn notifications off and on again in the browser.",
  );

export const remindersNotInDemo = () =>
  new AppError(
    "forbidden",
    "REMINDERS_NOT_IN_DEMO",
    "Notifications aren't part of the demo. Sign in with Google to turn them on.",
  );
