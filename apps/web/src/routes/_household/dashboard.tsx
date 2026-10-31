import { createFileRoute, redirect } from "@tanstack/react-router";

// The old home page; kept so existing links and bookmarks still land somewhere
export const Route = createFileRoute("/_household/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/lists", replace: true });
  },
});
