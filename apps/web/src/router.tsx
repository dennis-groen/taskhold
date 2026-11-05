import { QueryClient, onlineManager } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { PageSkeleton } from "./components/PageSkeleton.tsx";
import { registerChoreMutations } from "./features/chores/chores.mutations.ts";
import { registerShoppingMutations } from "./features/shopping/shopping.mutations.ts";
import { registerTodoMutations } from "./features/todos/todos.mutations.ts";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data loaded by a route loader counts as fresh for a moment, so the page doesn't refetch it on mount
      staleTime: 5_000,
      // Pages visited earlier stay in the copy kept on the device (lib/offline-cache.ts) for a day
      gcTime: Temporal.Duration.from({ hours: 24 }).total("milliseconds"),
    },
  },
});

// Changes saved on the device find their API call and optimistic update here after a restart,
// before any page sets them up. Registered before the saved copy is restored.
registerShoppingMutations(queryClient);
registerChoreMutations(queryClient);
registerTodoMutations(queryClient);

// React Query assumes it's online until the browser says otherwise. Opening the app without a
// connection must hold changes back from the start, not send them and fail.
onlineManager.setOnline(navigator.onLine);

// Create a new router instance. Loaders get the query client from the context.
export const router = createRouter({
  routeTree,
  context: { queryClient },
  // React Query decides when cached data is stale, so the router always runs loaders
  defaultPreloadStaleTime: 0,
  // A page whose data takes a moment shows its shape instead of a blank screen
  defaultPendingComponent: PageSkeleton,
  defaultPendingMs: 300,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
