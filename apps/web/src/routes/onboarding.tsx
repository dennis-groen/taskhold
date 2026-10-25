import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { PageShell } from "@/components/page-shell.tsx";

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
    <PageShell user={user}>
      <Outlet />
    </PageShell>
  );
}
