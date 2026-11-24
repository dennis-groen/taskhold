import { createFileRoute } from "@tanstack/react-router";

import { Group, GroupHeading } from "@/components/layout/Group.tsx";
import { GroupNote, SettingsPage } from "@/components/layout/SettingsPage.tsx";
import { LeftHandedRow } from "@/components/LeftHandedRow.tsx";
import { ThemeToggle } from "@/components/ThemeToggle.tsx";

export const Route = createFileRoute("/_household/household/appearance")({
  component: AppearanceRoute,
});

function AppearanceRoute() {
  return (
    <SettingsPage title="Appearance">
      <GroupHeading className="pt-2">Theme</GroupHeading>
      <Group className="py-1.5 pr-4 pl-5 sm:pr-5 sm:pl-6 lg:px-0">
        <ThemeToggle />
      </Group>
      <GroupNote>
        Auto matches your phone's light or dark setting. Each device keeps its own.
      </GroupNote>

      <GroupHeading>Layout</GroupHeading>
      <Group>
        <LeftHandedRow />
      </Group>
    </SettingsPage>
  );
}
