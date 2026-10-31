import { CaretLeftIcon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";

export function BackLink({ to, label = "Back" }: { to: LinkProps["to"]; label?: string }) {
  return (
    <Link
      to={to}
      className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CaretLeftIcon className="size-4" />
      {label}
    </Link>
  );
}
