import type { ReactNode } from "react";

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>
      {children && <p className="mt-3 text-base text-pretty text-muted-foreground">{children}</p>}
    </header>
  );
}
