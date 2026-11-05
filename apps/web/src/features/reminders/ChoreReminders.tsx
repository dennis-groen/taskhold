import { BellRingingIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api.ts";

import { useDeviceReminders, type DeviceState } from "./reminders.hooks.ts";
import { sendTestReminder, updateRemindAt } from "./reminders.api.ts";
import { reminderKeys, reminderStatusQuery } from "./reminders.queries.ts";

// Why the switch can't be used on this device
const UNAVAILABLE: Partial<Record<DeviceState, string>> = {
  "needs-install":
    "On iPhone and iPad, reminders only work in the installed app. Tap Share, then Add to Home Screen, and turn them on from there.",
  blocked:
    "Notifications are blocked for taskhold in this browser. Allow them in the site settings, then come back here.",
  unsupported: "This browser can't show notifications from taskhold.",
};

/** The daily chore summary: on or off for this device, and when it comes */
export function ChoreReminders() {
  const { data: status } = useQuery(reminderStatusQuery());
  // The server has no push keys: nothing to offer
  if (!status?.available) return null;
  return <ReminderSettings publicKey={status.publicKey} settings={status.settings} />;
}

function ReminderSettings({
  publicKey,
  settings,
}: {
  publicKey: string | null;
  settings: { remindAt: string; timeZone: string } | null;
}) {
  const queryClient = useQueryClient();
  const device = useDeviceReminders(publicKey);
  const switchId = useId();
  const timeId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setPending(false);
    }
  }

  async function saveTime(value: string) {
    if (!settings || !value || value === settings.remindAt) return;
    await run(async () => {
      queryClient.setQueryData(reminderKeys.status(), await updateRemindAt(value));
    }, "Couldn't change the time. Try again.");
  }

  const unavailable = UNAVAILABLE[device.state];
  const on = device.state === "on";

  return (
    <>
      <GroupHeading>Chore reminders</GroupHeading>
      <Group>
        <div className="flex min-h-14 items-start gap-3 px-4 py-3">
          <BellRingingIcon
            className="mt-0.5 size-5 shrink-0 text-primary-soft-foreground"
            weight="duotone"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor={switchId} className="block text-base font-semibold">
              Remind me on this device
            </label>
            <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
              {unavailable ??
                "Once a day, a summary of chores that are due or overdue: yours and the ones nobody is assigned to."}
            </p>
          </div>
          {!unavailable &&
            (device.state === "loading" ? (
              <Spinner className="mt-1" />
            ) : (
              <Switch
                id={switchId}
                className="mt-1"
                checked={on}
                disabled={pending}
                onCheckedChange={(checked) =>
                  void run(
                    checked ? device.turnOn : device.turnOff,
                    checked
                      ? "Couldn't turn reminders on. Try again."
                      : "Couldn't turn reminders off.",
                  )
                }
              />
            ))}
        </div>

        {on && settings && (
          <>
            <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <label htmlFor={timeId} className="min-w-0 flex-1">
                <span className="block text-base font-semibold">Time</span>
                <span className="block text-sm text-muted-foreground">
                  Every day, {settings.timeZone.replaceAll("_", " ")} time
                </span>
              </label>
              <Input
                id={timeId}
                key={settings.remindAt}
                type="time"
                required
                defaultValue={settings.remindAt}
                disabled={pending}
                className="w-28"
                onBlur={(event) => void saveTime(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveTime(event.currentTarget.value);
                }}
              />
            </div>
            <div className="flex min-h-13 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 text-sm text-muted-foreground" aria-live="polite">
                {testResult ?? "Check that notifications come through."}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const sent = await sendTestReminder();
                    setTestResult(
                      sent === 0
                        ? "Nothing arrived. Turn reminders off and on again."
                        : `Sent to ${sent === 1 ? "1 device" : `${sent} devices`}.`,
                    );
                  }, "Couldn't send a test. Try again.")
                }
              >
                Send a test
              </Button>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </Group>
    </>
  );
}
