import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data loaded by a route loader counts as fresh for a moment, so the page doesn't refetch it on mount
      staleTime: 5_000,
    },
  },
});

// Create a new router instance. Loaders get the query client from the context.
export const router = createRouter({
  routeTree,
  context: { queryClient },
  // React Query decides when cached data is stale, so the router always runs loaders
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
