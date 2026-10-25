import { Link, getRouteApi } from "@tanstack/react-router";

import { GoogleSignInButton } from "../components/google-sign-in-button.tsx";

const routeApi = getRouteApi("/");

export function SignInPage() {
  const { viewer } = routeApi.useRouteContext();
  const { redirect } = routeApi.useSearch();

  if (viewer.user) {
    return <Link to="/dashboard">Go to dashboard</Link>;
  }

  // Back to the page that asked for sign-in, e.g. an invite link
  return <GoogleSignInButton callbackURL={redirect ?? "/dashboard"} />;
}
