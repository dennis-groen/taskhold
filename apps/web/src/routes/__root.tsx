import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { RootError } from "@/components/RootError.tsx";
import { Toaster } from "@/components/ui/sonner";
import { UpdatePrompt } from "@/components/UpdatePrompt.tsx";
import { ViewerUnavailableError, fetchViewer, type Viewer } from "@/features/auth/auth.api.ts";
import {
  keepForOffline,
  keptForOffline,
  openOfflineCache,
  openSavedCopy,
} from "@/lib/offline-cache.ts";

import "@/styles/globals.css";

// Every page requires a signed-in user unless it's listed here
const PUBLIC_PATHS = new Set(["/"]);

// Where signed-in users without a household are allowed to be
function isSetupPath(path: string) {
  return path === "/onboarding" || path.startsWith("/onboarding/") || path.startsWith("/join/");
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    const { viewer, offline } = await whoIsSignedIn(context.queryClient);
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

    return { viewer, offline };
  },
  component: RootLayout,
  // Before anything is known about the person there's no page shape to show yet
  pendingComponent: () => <div className="min-h-dvh bg-canvas" />,
  errorComponent: ({ error }) => (
    <RootError unreachable={error instanceof ViewerUnavailableError} />
  ),
});

// How often to ask again while open from the device and the browser says it's online: the server
// may have been down rather than the connection
const RECHECK = Temporal.Duration.from({ seconds: 30 });

/**
 * Asks the API who is signed in, and brings back their lists and waiting changes from the device.
 * When the API can't be reached, the app opens from the copy on the device instead (`offline`),
 * as the person who was signed in when it was saved, if they were in a household. Without such a
 * copy the error stands, and the app says it can't reach taskhold.
 */
async function whoIsSignedIn(
  queryClient: QueryClient,
): Promise<{ viewer: Viewer; offline: boolean }> {
  let viewer: Viewer;
  try {
    viewer = await fetchViewer();
  } catch (error) {
    if (!(error instanceof ViewerUnavailableError)) throw error;
    await openSavedCopy(queryClient);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kept below, from fetchViewer
    const kept = keptForOffline(queryClient, "viewer") as Viewer | undefined;
    if (!kept?.user || !kept.household) throw error;
    return { viewer: kept, offline: true };
  }
  // Someone else, or nobody, drops what was saved for the last person
  await openOfflineCache(queryClient, viewer.user?.id ?? null);
  if (viewer.user) keepForOffline(queryClient, "viewer", viewer);
  return { viewer, offline: false };
}

/**
 * While the app is open from the copy on the device, asks again who is signed in once the
 * connection is back, or the app is opened again. Then pages load from the API again, and the
 * copy is dropped if the person was signed out in the meantime.
 */
function useRecheckWhenOnline() {
  const { offline } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    if (!offline) return undefined;
    const recheck = () => {
      if (onlineManager.isOnline() && document.visibilityState === "visible") {
        void router.invalidate();
      }
    };
    const unsubscribe = onlineManager.subscribe(recheck);
    document.addEventListener("visibilitychange", recheck);
    const timer = setInterval(recheck, RECHECK.total("milliseconds"));
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", recheck);
      clearInterval(timer);
    };
  }, [offline, router]);
}

function RootLayout() {
  useRecheckWhenOnline();
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
