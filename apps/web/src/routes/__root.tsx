import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";

import { fetchViewer } from "@/features/auth/auth.api.ts";

import "@/styles/globals.css";

// Every page requires a signed-in user unless it's listed here
const PUBLIC_PATHS = new Set(["/"]);

// Where signed-in users without a household are allowed to be
function isSetupPath(path: string) {
  return path === "/onboarding" || path.startsWith("/onboarding/") || path.startsWith("/join/");
}

export const Route = createRootRoute({
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
      throw redirect({ to: "/dashboard" });
    }

    return { viewer };
  },
  component: Outlet,
});
