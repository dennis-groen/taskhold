import { Link, type LinkProps } from "@tanstack/react-router";

import { CaretLeftIcon } from "@/components/icons.ts";

export function BackLink({ to, label = "Back" }: { to: LinkProps["to"]; label?: string }) {
  return (
    <Link
      to={to}
      className="-mt-2 -ml-2.5 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/80"
    >
      <CaretLeftIcon className="size-4" />
      {label}
    </Link>
  );
}
