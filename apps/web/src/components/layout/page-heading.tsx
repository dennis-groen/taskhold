import type { ReactNode } from "react";

export function PageHeading({
  title,
  children,
  action,
}: {
  title: string;
  /** A line under the title */
  children?: ReactNode;
  /** A button under the heading, e.g. the page's main action */
  action?: ReactNode;
}) {
  return (
    <header>
      <h1 className="text-title break-words">{title}</h1>
      {children && (
        // A div, not a p: the line can hold faces (SharedWithLine) as well as text
        <div className="mt-2 text-[0.9375rem] leading-6 text-pretty text-muted-foreground">
          {children}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </header>
  );
}
