import { queryOptions } from "@tanstack/react-query";

import { fetchReminderStatus } from "./reminders.api.ts";

export const reminderKeys = {
  all: ["reminders"] as const,
  status: () => [...reminderKeys.all, "status"] as const,
};

export const reminderStatusQuery = () =>
  queryOptions({
    queryKey: reminderKeys.status(),
    queryFn: fetchReminderStatus,
  });
