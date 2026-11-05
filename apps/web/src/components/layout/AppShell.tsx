import type { ReactNode } from "react";

import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Wordmark } from "@/components/Wordmark.tsx";

/** Page frame for signed-in screens: wordmark, who's signed in, and account actions on the right */
export function AppShell({
  user,
  actions,
  children,
}: {
  user: { name: string; email: string; image: string | null };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <Wordmark />
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={user.name} image={user.image} size="sm" />
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          {actions}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pt-[min(10vh,5rem)] pb-16 sm:px-8">
        <div className="max-w-md">{children}</div>
      </main>
    </div>
  );
}
