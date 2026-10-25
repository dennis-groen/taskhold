import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell.tsx";
import { SignOutButton } from "@/features/auth/components/sign-out-button.tsx";

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
