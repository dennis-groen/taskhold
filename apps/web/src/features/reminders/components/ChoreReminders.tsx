import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import {
  ArrowClockwiseIcon,
  BellIcon,
  BasketIcon,
  BellSlashIcon,
  ClockIcon,
  ExportIcon,
  PaperPlaneTiltIcon,
  PlusSquareIcon,
} from "@/components/icons.ts";
import { Group } from "@/components/layout/Group.tsx";
import { OfflineNote } from "@/components/layout/OfflineNote.tsx";
import { SettingButton, SettingRow } from "@/components/layout/SettingRow.tsx";
import { GroupNote } from "@/components/layout/SettingsPage.tsx";
import { SHEET_BODY, SheetContent, SheetEyebrow } from "@/components/layout/Sheet.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api.ts";
import { cn } from "cn";

import { useDeviceReminders } from "../reminders.hooks.ts";
import { sendTestReminder, updateReminderSettings } from "../reminders.api.ts";
import { reminderKeys, reminderStatusQuery } from "../reminders.queries.ts";

/** What today's reminder would say, from what's due now. The route works it out. */
export type ReminderPreview = { title: string; body: string };

/**
 * The Notifications page's body, with its loading, offline and unavailable states. The rows: the
 * switch for this phone, which notifications, the time, and Send a test. Turning it on the first
 * time explains it with a sample before the phone asks; on an iPhone outside the Home Screen it
 * explains how to install first.
 */
export function ChoreReminders({ preview }: { preview: ReminderPreview | null }) {
  const { data: status, isError, fetchStatus, refetch } = useQuery(reminderStatusQuery());

  if (!status) {
    // A query made offline waits rather than fails
    if (fetchStatus === "paused") {
      return (
        <OfflineNote className="mt-2">
          You're offline. Notification settings come back once you're connected.
        </OfflineNote>
      );
    }
    return (
      <Group className="mt-2">
        {isError ? (
          <SettingButton
            icon={ArrowClockwiseIcon}
            tone="plain"
            title="Try again"
            sub="Couldn't load your notification settings."
            onClick={() => void refetch()}
          />
        ) : (
          <SettingRow icon={BellIcon} title="Notifications on this phone" end={<Spinner />} />
        )}
      </Group>
    );
  }

  if (!status.available) {
    return (
      <Group className="mt-2">
        <SettingRow
          icon={BellSlashIcon}
          tone="muted"
          title="Notifications"
          sub="taskhold isn't sending notifications right now."
        />
      </Group>
    );
  }

  return (
    <ReminderSettings publicKey={status.publicKey} settings={status.settings} preview={preview} />
  );
}

type Sheet = "install" | "ask" | null;

function ReminderSettings({
  publicKey,
  settings,
  preview,
}: {
  publicKey: string | null;
  settings: {
    remindAt: string;
    timeZone: string;
    dailySummary: boolean;
    shoppingTrips: boolean;
  } | null;
  preview: ReminderPreview | null;
}) {
  const queryClient = useQueryClient();
  const device = useDeviceReminders(publicKey);
  const switchId = useId();
  const timeId = useId();
  const dailyId = useId();
  const shoppingId = useId();
  const [pending, setPending] = useState(false);
  // Where the phone's switch is headed while that's saved, so a tap shows at once. Turning on can
  // take a second or two (the push service, then the API), and a switch that sat still read as a
  // missed tap: the second tap turned it straight off again.
  const [turning, setTurning] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const time = settings?.remindAt ?? "8:00";

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
      queryClient.setQueryData(
        reminderKeys.status(),
        await updateReminderSettings({ remindAt: value }),
      );
    }, "Couldn't change the time. Try again.");
  }

  async function saveChoice(changes: { dailySummary: boolean } | { shoppingTrips: boolean }) {
    const key = reminderStatusQuery().queryKey;
    const before = queryClient.getQueryData(key);
    // Shown at once, and put back if the save fails
    queryClient.setQueryData(key, (status) =>
      status?.settings ? { ...status, settings: { ...status.settings, ...changes } } : status,
    );
    await run(async () => {
      try {
        queryClient.setQueryData(key, await updateReminderSettings(changes));
      } catch (err) {
        queryClient.setQueryData(key, before);
        throw err;
      }
    }, "Couldn't save that. Try again.");
  }

  async function switchDevice(next: boolean, action: () => Promise<unknown>, fallback: string) {
    setTurning(next);
    await run(action, fallback);
    setTurning(null);
  }

  function turnOn() {
    void switchDevice(true, device.turnOn, "Couldn't turn notifications on. Try again.");
  }

  function flip(checked: boolean) {
    if (!checked) {
      void switchDevice(false, device.turnOff, "Couldn't turn notifications off.");
      return;
    }
    if (device.state === "needs-install") return setSheet("install");
    // Explained once, before the phone's own question, which can't be asked twice
    if (Notification.permission === "default") return setSheet("ask");
    turnOn();
  }

  const on = device.state === "on";
  const blocked = device.state === "blocked";

  if (device.state === "unsupported") {
    return (
      <Group className="mt-2">
        <SettingRow
          icon={BellSlashIcon}
          tone="muted"
          title="Notifications"
          sub="This browser can't show notifications. Try taskhold in Chrome or Safari, or add it to your Home Screen."
        />
      </Group>
    );
  }

  return (
    <>
      <Group className="mt-2">
        <SettingRow
          icon={blocked ? BellSlashIcon : BellIcon}
          tone={blocked ? "muted" : undefined}
          title="Notifications on this phone"
          sub={
            blocked
              ? "Blocked in your phone's Settings"
              : on
                ? "On for this phone"
                : `${time}, when chores or to-dos are due`
          }
          htmlFor={switchId}
          end={
            device.state === "loading" ? (
              <Spinner />
            ) : (
              <Switch
                id={switchId}
                checked={turning ?? on}
                disabled={pending || blocked}
                onCheckedChange={flip}
              />
            )
          }
        />

        {blocked && (
          <div className="mx-4 my-2 rounded-2xl bg-destructive/8 px-4 py-3 text-sm">
            <b className="block font-[700]">Notifications are blocked for taskhold</b>
            <p className="mt-1 text-pretty text-muted-foreground">
              Your phone said no when we asked, so taskhold can't ask again. Allow notifications for
              taskhold in your phone's or browser's settings, then come back here.
            </p>
          </div>
        )}

        {on && settings && (
          <>
            <SettingRow
              icon={BellIcon}
              title="Daily reminder"
              sub="Your chores, Anyone's, and your to-dos"
              htmlFor={dailyId}
              end={
                <Switch
                  id={dailyId}
                  checked={settings.dailySummary}
                  disabled={pending}
                  onCheckedChange={(checked) => void saveChoice({ dailySummary: checked })}
                />
              }
            />
            {settings.dailySummary && (
              <SettingRow
                icon={ClockIcon}
                title="Reminder time"
                sub="Same on all your devices"
                htmlFor={timeId}
                end={
                  <input
                    id={timeId}
                    key={settings.remindAt}
                    type="time"
                    required
                    defaultValue={settings.remindAt}
                    disabled={pending}
                    className="h-11 rounded-xl bg-muted px-3 text-base font-[650] tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
                    onBlur={(event) => void saveTime(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveTime(event.currentTarget.value);
                    }}
                  />
                }
              />
            )}
            <SettingRow
              icon={BasketIcon}
              title="When someone goes shopping"
              sub="So you can add what you need"
              htmlFor={shoppingId}
              end={
                <Switch
                  id={shoppingId}
                  checked={settings.shoppingTrips}
                  disabled={pending}
                  onCheckedChange={(checked) => void saveChoice({ shoppingTrips: checked })}
                />
              }
            />
            <SettingButton
              icon={PaperPlaneTiltIcon}
              title="Send a test"
              liveSub
              sub={testResult ?? "Arrives on every phone with notifications on"}
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const sent = await sendTestReminder();
                  setTestResult(
                    sent === 0
                      ? "Nothing arrived. Turn the reminder off and on again."
                      : `Sent to ${sent === 1 ? "1 phone" : `${sent} phones`}`,
                  );
                }, "Couldn't send a test. Try again.")
              }
            />
          </>
        )}

        {error && (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </Group>
      <GroupNote>
        Turn notifications on separately on each phone or browser. Which ones you get and the
        reminder time are the same on all of them.
      </GroupNote>

      <Drawer open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent>
          <SheetEyebrow icon={BellIcon}>Notifications</SheetEyebrow>
          {sheet === "install" ? (
            <InstallFirst />
          ) : (
            <AskFirst
              time={time}
              preview={preview}
              onTurnOn={() => {
                setSheet(null);
                turnOn();
              }}
              onNotNow={() => setSheet(null)}
            />
          )}
        </SheetContent>
      </Drawer>
    </>
  );
}

const TITLE = "text-[1.75rem] leading-[1.08] font-[850] tracking-[-0.02em] [font-stretch:118%]";

/** iPhone and iPad only notify from the Home Screen: three steps to get there */
function InstallFirst() {
  const steps = [
    <>
      Tap <b>Share</b>{" "}
      <ExportIcon aria-hidden weight="bold" className="inline size-4.5 align-[-3px]" /> in Safari's
      bar.
    </>,
    <>
      Choose <b>Add to Home Screen</b>{" "}
      <PlusSquareIcon aria-hidden weight="bold" className="inline size-4.5 align-[-3px]" />
    </>,
    <>Open taskhold from your Home Screen and turn on the reminder here.</>,
  ];
  return (
    <div className={cn(SHEET_BODY, "pt-1")}>
      <DrawerTitle className={TITLE}>Add taskhold to your Home Screen first</DrawerTitle>
      <DrawerDescription className="mt-2 text-[0.9375rem] text-muted-foreground">
        iPhone only sends notifications to web apps on the Home Screen. It takes three taps.
      </DrawerDescription>
      <ol className="mt-4 divide-y divide-border border-t border-border">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-3 py-3.5 text-[1.0625rem]">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-[750]"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Shows what the reminder looks like before the phone's own one-time question */
function AskFirst({
  time,
  preview,
  onTurnOn,
  onNotNow,
}: {
  time: string;
  preview: ReminderPreview | null;
  onTurnOn: () => void;
  onNotNow: () => void;
}) {
  return (
    <div className={cn(SHEET_BODY, "pt-1")}>
      <DrawerTitle className={TITLE}>One reminder a day, only when something's due</DrawerTitle>
      <div aria-hidden className="mt-4 flex gap-3 rounded-[20px] bg-muted p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-card shadow-card">
          <BellIcon weight="fill" className="size-5 text-area-fg" />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="flex items-baseline justify-between gap-2">
            <b className="font-[700]">{preview?.title ?? "2 due today"}</b>
            <span className="text-xs text-muted-foreground tabular-nums">{time}</span>
          </span>
          <span className="block text-pretty text-muted-foreground">
            {preview?.body ?? "Your chores and to-dos that are due, by name"}
          </span>
        </span>
      </div>
      <DrawerDescription className="mt-3 text-[0.9375rem] text-pretty text-muted-foreground">
        At {time}, when your chores, Anyone's chores or your to-dos are due or late. Nothing on days
        with nothing due. You can change the time.
      </DrawerDescription>
      <Button
        size="xl"
        onClick={onTurnOn}
        className="mt-5 w-full rounded-2xl bg-foreground text-background hover:bg-foreground/90"
      >
        Turn on reminders
      </Button>
      <Button size="xl" variant="secondary" onClick={onNotNow} className="mt-2 w-full rounded-2xl">
        Not now
      </Button>
      <p className="mt-3 text-center text-[0.8125rem] text-muted-foreground">
        Next, your phone asks to allow notifications.
      </p>
    </div>
  );
}
