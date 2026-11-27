import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { SettingsPage } from "@/components/layout/SettingsPage.tsx";
import { useChoreList } from "@/features/chores/chores.hooks.ts";
import {
  ChoreReminders,
  type ReminderPreview,
} from "@/features/reminders/components/ChoreReminders.tsx";
import { todosQuery } from "@/features/todos/todos.queries.ts";
import { daysBetween, today } from "@/lib/dates.ts";

const householdRoute = getRouteApi("/_household");

export const Route = createFileRoute("/_household/household/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const preview = useReminderPreview();
  return (
    <SettingsPage title="Notifications">
      <ChoreReminders preview={preview} />
    </SettingsPage>
  );
}

// More names than this and the notification gets cut off
const NAMES_SHOWN = 4;

/**
 * Today's reminder, as the first-run sheet shows it: the viewer's chores, Anyone's, and their
 * to-dos that are due today or late. Null when nothing is, or before they've loaded.
 */
function useReminderPreview(): ReminderPreview | null {
  const { user } = householdRoute.useRouteContext();
  const chores = useChoreList();
  const { data: todos = [] } = useQuery(todosQuery());
  const on = today();
  const due = [
    ...chores.filter((chore) => !chore.done && (!chore.assignee || chore.assignee.id === user.id)),
    ...todos.filter((todo) => !todo.done),
  ].filter((item) => item.dueOn !== null && daysBetween(on, item.dueOn) <= 0);
  if (due.length === 0) return null;

  const late = due.filter((item) => item.dueOn !== null && daysBetween(on, item.dueOn) < 0).length;
  const dueToday = due.length - late;
  const title = [dueToday > 0 && `${dueToday} due today`, late > 0 && `${late} overdue`]
    .filter(Boolean)
    .join(", ");
  const names = due.map((item) => item.name);
  const body =
    names.length > NAMES_SHOWN
      ? `${names.slice(0, NAMES_SHOWN).join(", ")} and ${names.length - NAMES_SHOWN} more`
      : names.join(", ");
  return { title, body };
}
