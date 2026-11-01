// Runs the daily reminder summaries: checks once a minute whose reminder time has come.
import { logger } from "../../lib/logger.ts";
import { pushConfigured } from "../../lib/push.ts";
import { describeError } from "../../lib/wide-event.ts";
import { sendDueReminders } from "./reminders.service.ts";

const INTERVAL = Temporal.Duration.from({ minutes: 1 });

const remindersLogger = logger.child({ component: "reminders" });

/** Starts checking for reminders to send. Returns the function that stops it. */
export function startReminders(): () => void {
  if (!pushConfigured) {
    remindersLogger.info("VAPID keys aren't set, so chore reminders are off");
    return () => {};
  }

  let running = false;
  const run = async () => {
    // A slow run (many people, slow push services) mustn't overlap the next
    if (running) return;
    running = true;
    const started = performance.now();
    try {
      const result = await sendDueReminders(Temporal.Now.instant());
      if (result.people > 0) {
        remindersLogger.info(
          { ...result, duration_ms: Math.round(performance.now() - started) },
          "Sent chore reminders",
        );
      }
    } catch (err) {
      remindersLogger.error({ error: describeError(err) }, "Sending chore reminders failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), INTERVAL.total("milliseconds"));
  void run();
  return () => clearInterval(timer);
}
