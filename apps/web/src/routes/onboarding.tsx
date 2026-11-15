import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell.tsx";
import { SignOutButton } from "@/features/auth/components/SignOutButton.tsx";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: ({ context }) => {
    if (!context.viewer.user) throw redirect({ to: "/" });
    return { user: context.viewer.user };
  },
  component: OnboardingLayout,
});

function OnboardingLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user} actions={<SignOutButton />}>
      <Outlet />
    </AppShell>
  );
}
