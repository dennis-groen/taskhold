import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CheckIcon } from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Wordmark } from "@/components/Wordmark.tsx";
import { cn } from "cn";

import { GoogleSignInButton } from "./GoogleSignInButton.tsx";

const routeApi = getRouteApi("/");

// What a household list looks like inside, so the first screen shows what the app is for
const PREVIEW = [
  { name: "Oat milk", quantity: "2", by: null },
  { name: "Tomatoes", quantity: "500 g", by: "Sam" },
  { name: "Sourdough bread", quantity: null, by: null },
];

export function SignInPage() {
  const { redirect } = routeApi.useSearch();
  const joining = redirect?.startsWith("/join/") ?? false;
  const ticked = useTickAfterAMoment();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-5">
      <header className="mx-auto w-full max-w-sm pt-[calc(2rem+env(safe-area-inset-top))]">
        <Wordmark />
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <div
          aria-hidden
          className="mb-10 -rotate-1 overflow-hidden rounded-2xl bg-card shadow-raised select-none"
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <span className="font-heading text-lg font-bold tracking-[-0.02em]">Groceries</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Shared with Sam
              <UserAvatar name="Sam" image={null} size="sm" />
            </span>
          </div>
          <ul className="divide-y divide-border/80 border-t border-border/80">
            {PREVIEW.map((item, index) => {
              const checked = index === PREVIEW.length - 1 && ticked;
              return (
                <li key={item.name} className="flex min-h-12 items-center gap-3 px-4">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-200",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-[color-mix(in_oklch,var(--input),var(--foreground)_12%)]",
                    )}
                  >
                    {checked && (
                      <CheckIcon
                        className="size-3.5 animate-[check-pop_280ms_var(--ease-out-quint)] motion-reduce:animate-none"
                        weight="bold"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.9375rem]">
                    <span className="tick-label" data-done={checked || undefined}>
                      {item.name}
                    </span>
                  </span>
                  {item.by && <UserAvatar name={item.by} image={null} size="sm" />}
                  {item.quantity && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {item.quantity}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <h1 className="text-title text-[2.25rem]">
          {joining ? "Sign in to join your household" : "Your household, on one list"}
        </h1>
        <p className="mt-3 text-base leading-7 text-pretty text-muted-foreground">
          {joining
            ? "After signing in you'll see the household and its members, and can join with one tap."
            : "Shopping lists and chores for the people you live with. Everyone sees what's needed, what's in the cart and whose turn it is."}
        </p>

        {/* Back to the page that asked for sign-in, e.g. an invite link */}
        <GoogleSignInButton callbackURL={redirect ?? "/lists"} className="mt-8" />
      </main>

      <footer className="mx-auto w-full max-w-sm pb-[calc(2rem+env(safe-area-inset-bottom))] text-sm text-muted-foreground">
        New here? Signing in creates your account.
      </footer>
    </div>
  );
}

/** The preview's last item ticks itself off shortly after the page opens */
function useTickAfterAMoment() {
  const [ticked, setTicked] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTicked(true), 900);
    return () => clearTimeout(timer);
  }, []);
  return ticked;
}
