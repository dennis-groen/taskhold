import { CheckIcon } from "@phosphor-icons/react";
import { getRouteApi } from "@tanstack/react-router";

import { GoogleSignInButton } from "../components/google-sign-in-button.tsx";

const routeApi = getRouteApi("/");

// What a household list looks like inside, so the first screen shows what the app is for
const PREVIEW = [
  { name: "Oat milk", quantity: "2", checked: false },
  { name: "Tomatoes", quantity: "500 g", checked: false },
  { name: "Sourdough bread", quantity: null, checked: true },
];

export function SignInPage() {
  const { redirect } = routeApi.useSearch();
  const joining = redirect?.startsWith("/join/") ?? false;

  return (
    <div className="flex min-h-dvh flex-col bg-muted/50 px-4 dark:bg-background">
      <header className="mx-auto w-full max-w-sm pt-8">
        <span className="text-base font-semibold tracking-tight">taskhold</span>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <div
          aria-hidden
          className="mb-10 divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 select-none"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">Groceries</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              Shared with Sam
              <span className="size-1.5 rounded-full bg-primary" />
            </span>
          </div>
          {PREVIEW.map((item) => (
            <div key={item.name} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={
                  item.checked
                    ? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : "size-5 rounded-full border border-input"
                }
              >
                {item.checked && <CheckIcon className="size-3" weight="bold" />}
              </span>
              <span
                className={
                  item.checked
                    ? "flex-1 text-sm text-muted-foreground line-through"
                    : "flex-1 text-sm"
                }
              >
                {item.name}
              </span>
              {item.quantity && (
                <span className="text-xs text-muted-foreground tabular-nums">{item.quantity}</span>
              )}
            </div>
          ))}
        </div>

        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
          {joining ? "Sign in to join your household" : "Your household, on one list"}
        </h1>
        <p className="mt-3 text-base text-pretty text-muted-foreground">
          {joining
            ? "After signing in you'll see the household and its members, and can join with one tap."
            : "Shared shopping lists for the people you live with. Everyone sees what's needed and what's already in the cart."}
        </p>

        {/* Back to the page that asked for sign-in, e.g. an invite link */}
        <GoogleSignInButton callbackURL={redirect ?? "/lists"} className="mt-8" />
      </main>

      <footer className="mx-auto w-full max-w-sm pb-8 text-sm text-muted-foreground">
        New here? Signing in creates your account.
      </footer>
    </div>
  );
}
