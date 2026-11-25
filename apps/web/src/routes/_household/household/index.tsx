import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { PaletteIcon, UserCircleIcon } from "@/components/icons.ts";
import { SettingLink } from "@/components/layout/SettingRow.tsx";
import { EndDemoButton } from "@/features/demo/components/EndDemoButton.tsx";
import { HouseholdOverviewPage } from "@/features/households/components/HouseholdOverviewPage.tsx";
import { NotificationsLink } from "@/features/reminders/components/NotificationsLink.tsx";
import { useTheme, type ThemeChoice } from "@/lib/theme.ts";

const householdRoute = getRouteApi("/_household");

export const Route = createFileRoute("/_household/household/")({
  component: HouseholdRoute,
});

const THEME_NAMES: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", system: "Auto" };

/**
 * The Household page, with a row per page of settings. Add a setting by adding its row here and a
 * route beside this file.
 */
function HouseholdRoute() {
  const { user, demoEndsAt } = householdRoute.useRouteContext();
  const { choice } = useTheme();

  return (
    <HouseholdOverviewPage
      endDemo={demoEndsAt ? <EndDemoButton /> : undefined}
      settings={
        <>
          <NotificationsLink />
          <SettingLink
            to="/household/appearance"
            icon={PaletteIcon}
            title="Appearance"
            sub="Theme and left-handed layout"
            value={THEME_NAMES[choice]}
          />
          <SettingLink
            to="/household/account"
            icon={UserCircleIcon}
            title="Account"
            sub={<span className="block truncate">{demoEndsAt ? "Demo visitor" : user.email}</span>}
          />
        </>
      }
    />
  );
}
