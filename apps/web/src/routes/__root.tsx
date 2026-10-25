import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";

import { api, parseResponse, type Viewer } from "@/lib/api.ts";

import "@/styles/globals.css";

// Every page requires a signed-in user unless it's listed here
const PUBLIC_PATHS = new Set(["/"]);

const SIGNED_OUT: Viewer = { user: null, household: null };

// Where signed-in users without a household are allowed to be
function isSetupPath(path: string) {
  return path === "/onboarding" || path.startsWith("/onboarding/") || path.startsWith("/join/");
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // An unreachable API counts as signed out, so protected pages stay closed
    const viewer = await parseResponse(api.viewer.$get()).catch(() => SIGNED_OUT);
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
