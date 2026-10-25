import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar.tsx";
import type { Viewer } from "@/lib/api.ts";
import { authClient } from "@/lib/auth-client.ts";

export function PageShell({
  user,
  children,
}: {
  user: NonNullable<Viewer["user"]>;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: "/" });
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <span className="text-base font-semibold tracking-tight">taskhold</span>
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={user.name} image={user.image} size="sm" />
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pt-[min(10vh,5rem)] pb-16 sm:px-8">
        <div className="max-w-md">{children}</div>
      </main>
    </div>
  );
}

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>
      {children && <p className="mt-3 text-base text-pretty text-muted-foreground">{children}</p>}
    </header>
  );
}
