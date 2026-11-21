import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { BasketIcon, CheckIcon, LockIcon, RepeatIcon, type Icon } from "@/components/icons.ts";
import { Wordmark } from "@/components/Wordmark.tsx";
import { cn } from "cn";

import { GoogleSignInButton } from "./GoogleSignInButton.tsx";

const routeApi = getRouteApi("/");

/**
 * The first screen: one card for each thing the app does, in that area's colour, stacked like a
 * hand of cards. Round ticks for shared things, a square one for what's yours alone.
 */
export function SignInPage() {
  const { redirect } = routeApi.useSearch();
  const joining = redirect?.startsWith("/join/") ?? false;
  const ticked = useTickAfterAMoment();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-5">
      <header className="mx-auto w-full max-w-sm pt-[calc(1rem+env(safe-area-inset-top))]">
        <Wordmark />
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div aria-hidden className="flex flex-1 items-center py-6 select-none">
          <div className="relative mx-2 h-[318px] flex-1">
            <AreaCard
              index={0}
              className="top-0 -rotate-2 bg-(--shop-slab)"
              icon={BasketIcon}
              label="Groceries · Noor ticked it"
              title="Oat milk, 2"
            >
              <span
                className={cn(
                  "relative grid size-[26px] place-items-center rounded-full border-2 border-white/90 transition-colors duration-200 ease-(--ease-out)",
                  ticked && "bg-white text-(--shop-slab)",
                )}
              >
                {ticked && (
                  <CheckIcon
                    weight="bold"
                    className="size-[15px] animate-[check-pop_280ms_var(--ease-out)] motion-reduce:animate-none"
                  />
                )}
                {ticked && (
                  <i
                    data-tone="2"
                    className="absolute -right-1 -bottom-1 size-3 rounded-full bg-(--tone-bg) ring-2 ring-(--shop-slab)"
                  />
                )}
              </span>
            </AreaCard>
            <AreaCard
              index={1}
              className="top-[100px] rotate-[1.5deg] bg-(--cho-slab)"
              icon={RepeatIcon}
              label="Every week · Sam"
              title="Take out the bins"
            >
              <span className="size-[26px] rounded-full border-2 border-white/90" />
            </AreaCard>
            <AreaCard
              index={2}
              className="top-[200px] -rotate-1 bg-(--todo-slab) dark:bg-[#33363c]"
              icon={LockIcon}
              label="Only you"
              title="Book the dentist"
            >
              <span className="size-[26px] rounded-[7px] border-2 border-white/90" />
            </AreaCard>
          </div>
        </div>

        <h1 className="text-[2.125rem] leading-[1.02] font-[830] tracking-[-0.03em] text-balance [font-stretch:125%]">
          {joining ? "Sign in to join your household" : "Who's getting the milk?"}
        </h1>
        <p className="mt-3 text-[1.0625rem] leading-[1.4] text-pretty text-muted-foreground">
          {joining
            ? "After signing in you'll see the household and who's in it, and can join with one tap."
            : "Shared shopping lists and chores for everyone you live with, plus to-dos only you can see."}
        </p>

        {/* Back to the page that asked for sign-in, e.g. an invite link */}
        <GoogleSignInButton callbackURL={redirect ?? "/lists"} className="mt-7" />
        <p className="mt-3 mb-4 text-center text-[0.8125rem] text-muted-foreground">
          {joining
            ? "New here? Signing in creates your account."
            : "Next, you'll join a household or start one."}
        </p>
      </main>
    </div>
  );
}

/** One card in the stack. They settle in one after another, the first time the page opens. */
function AreaCard({
  index,
  className,
  icon: CardIcon,
  label,
  title,
  children,
}: {
  index: number;
  className: string;
  icon: Icon;
  label: string;
  title: string;
  /** The tick, top right */
  children: ReactNode;
}) {
  return (
    <div
      style={{ transitionDelay: `${80 + index * 70}ms` }}
      className={cn(
        "absolute inset-x-1.5 h-[116px] rounded-[22px] px-[18px] py-4 text-white shadow-[0_12px_26px_-16px_rgb(0_0_0/0.45)]",
        "transition-[opacity,translate] duration-500 ease-(--ease-out) starting:translate-y-4 starting:opacity-0 motion-reduce:transition-none",
        className,
      )}
    >
      <div className="flex h-[26px] items-center justify-between">
        <small className="flex items-center gap-1.5 text-[0.8125rem] font-[650]">
          <CardIcon weight="bold" className="size-[15px]" />
          {label}
        </small>
        {children}
      </div>
      <b className="mt-2.5 block text-[1.75rem] leading-none font-[820] tracking-[-0.03em] [font-stretch:125%]">
        {title}
      </b>
    </div>
  );
}

/** The first card's tick fills in shortly after the stack has settled */
function useTickAfterAMoment() {
  const [ticked, setTicked] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTicked(true), 1100);
    return () => clearTimeout(timer);
  }, []);
  return ticked;
}
