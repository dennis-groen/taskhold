import * as React from "react";
import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client.ts";

import "@/styles/globals.css";

// Every page requires a signed-in user unless it's listed here
const PUBLIC_PATHS = new Set(["/"]);

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session && !PUBLIC_PATHS.has(location.pathname)) {
      throw redirect({ to: "/" });
    }
    return { session };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <React.Fragment>
      <div>Hello "__root"!</div>
      <Outlet />
    </React.Fragment>
  );
}
