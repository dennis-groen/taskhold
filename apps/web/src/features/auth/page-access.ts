import type { Viewer } from "./auth.api.ts";

// Every page requires a signed-in user unless it's listed here
const PUBLIC_PATHS = new Set(["/"]);

// Where signed-in users without a household are allowed to be
function isSetupPath(path: string) {
  return path === "/onboarding" || path.startsWith("/onboarding/") || path.startsWith("/join/");
}

/**
 * Where to send someone who may not open `path`: signed-out visitors to sign-in, people without
 * a household to onboarding, and people with one away from onboarding and invite links. Null
 * when they may stay.
 */
export function whereToSend(viewer: Viewer, path: string): "/" | "/onboarding" | "/lists" | null {
  if (!viewer.user) return PUBLIC_PATHS.has(path) ? null : "/";
  if (!viewer.household) return PUBLIC_PATHS.has(path) || isSetupPath(path) ? null : "/onboarding";
  return isSetupPath(path) ? "/lists" : null;
}
