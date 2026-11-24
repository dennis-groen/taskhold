import { useQuery } from "@tanstack/react-query";

import { BellIcon, BellSlashIcon } from "@/components/icons.ts";
import { SettingLink } from "@/components/layout/SettingRow.tsx";

import { useDeviceReminders, type DeviceState } from "../reminders.hooks.ts";
import { reminderStatusQuery } from "../reminders.queries.ts";

// Short, so the line under the title keeps to one line on a phone. The page says why.
const VALUE: Record<DeviceState, string | undefined> = {
  loading: undefined,
  unsupported: "Off",
  "needs-install": "Off",
  blocked: "Blocked",
  off: "Off",
  on: "On",
};

/**
 * The Household page's way into the notification settings, saying whether they're on here. It
 * shows straight away, so the Settings group doesn't shift when the status arrives.
 */
export function NotificationsLink() {
  const { data: status, isError, fetchStatus } = useQuery(reminderStatusQuery());
  // The server has no push keys: nothing to offer
  if (status && !status.available) return null;
  // A query made offline waits rather than fails
  if (!status) {
    return (
      <Row value={fetchStatus === "paused" ? "Offline" : isError ? "Unavailable" : undefined} />
    );
  }
  return <DeviceRow publicKey={status.publicKey} />;
}

function DeviceRow({ publicKey }: { publicKey: string | null }) {
  const { state } = useDeviceReminders(publicKey);
  return <Row value={VALUE[state]} on={state === "on" || state === "loading"} />;
}

function Row({ value, on = true }: { value?: string; on?: boolean }) {
  return (
    <SettingLink
      to="/household/notifications"
      icon={on ? BellIcon : BellSlashIcon}
      title="Notifications"
      sub="Daily reminder and shopping trips"
      value={value}
    />
  );
}
