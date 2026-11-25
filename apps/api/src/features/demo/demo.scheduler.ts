// Deletes demos once they've run their course: checks every few minutes.
import { env } from "../../env.ts";
import { logger } from "../../lib/logger.ts";
import { describeError } from "../../lib/wide-event.ts";
import { removeExpiredDemos } from "./demo.service.ts";

const INTERVAL = Temporal.Duration.from({ minutes: 10 });

const demoLogger = logger.child({ component: "demo" });

/** Starts deleting expired demos. Returns the function that stops it. */
export function startDemoCleanup(): () => void {
  if (!env.DEMO_MODE) return () => {};

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const removed = await removeExpiredDemos(Temporal.Now.instant());
      if (removed.households > 0 || removed.accounts > 0) {
        demoLogger.info(removed, "Deleted expired demos");
      }
    } catch (err) {
      demoLogger.error({ error: describeError(err) }, "Deleting expired demos failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), INTERVAL.total("milliseconds"));
  void run();
  return () => clearInterval(timer);
}
