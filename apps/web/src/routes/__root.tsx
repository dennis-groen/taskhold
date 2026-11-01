import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, redirect } from "@tanstack/react-router";

import { RootError } from "@/components/root-error.tsx";
import { Toaster } from "@/components/ui/sonner";
import { UpdatePrompt } from "@/components/update-prompt.tsx";
import { ViewerUnavailableError, fetchViewer } from "@/features/auth/auth.api.ts";

import "@/styles/globals.css";

// Every page requires a signed-in user unless it's listed here
const PUBLIC_PATHS = new Set(["/"]);

// Where signed-in users without a household are allowed to be
function isSetupPath(path: string) {
  return path === "/onboarding" || path.startsWith("/onboarding/") || path.startsWith("/join/");
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    const viewer = await fetchViewer();
    const path = location.pathname;

    if (!viewer.user) {
      if (!PUBLIC_PATHS.has(path)) {
        throw redirect({ to: "/", search: { redirect: location.href } });
      }
    } else if (!viewer.household) {
      if (!PUBLIC_PATHS.has(path) && !isSetupPath(path)) {
        throw redirect({ to: "/onboarding" });
      }
    } else if (isSetupPath(path)) {
      throw redirect({ to: "/lists" });
    }

    return { viewer };
  },
  component: RootLayout,
  errorComponent: ({ error }) => (
    <RootError unreachable={error instanceof ViewerUnavailableError} />
  ),
});

function RootLayout() {
  return (
    <>
      <Outlet />
      <UpdatePrompt />
      {/* Brief notices after an action: undo, failed saves, a new version. Not for form errors. */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "var(--toast-bottom)" }}
        mobileOffset={{ bottom: "var(--toast-bottom)" }}
      />
    </>
  );
}
