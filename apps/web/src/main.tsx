// First, so Temporal exists before any other module runs. Installs only where the browser has no
// Temporal of its own (Safari, older Chrome and Firefox).
import "temporal-polyfill/global";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ThemeProvider } from "@/components/ThemeProvider.tsx";
import { queryClient, router } from "@/router.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
