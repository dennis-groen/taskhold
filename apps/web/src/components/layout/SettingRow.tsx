import type { ReactNode } from "react";

import type { Icon } from "@/components/icons.ts";
import { cn } from "cn";

/**
 * A row in a settings group: an icon, a name with a quieter line under it, and a control or value
 * at the end. Pass `htmlFor` to make the words a label for that control.
 */
export function SettingRow({
  icon: RowIcon,
  title,
  sub,
  end,
  htmlFor,
  tone,
  className,
}: {
  icon: Icon;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  htmlFor?: string;
  /** "muted" for something that can't be used right now */
  tone?: "muted";
  className?: string;
}) {
  const Words = htmlFor ? "label" : "span";
  return (
    <div className={cn("flex min-h-15 items-center gap-3.5 py-2.5 pr-4 pl-4", className)}>
      <RowIcon
        aria-hidden
        className={cn(
          "size-[22px] shrink-0",
          tone === "muted" ? "text-muted-foreground" : "text-foreground",
        )}
      />
      <Words htmlFor={htmlFor} className="min-w-0 flex-1">
        <span className="block text-base font-[650]">{title}</span>
        {sub && <span className="block text-sm text-pretty text-muted-foreground">{sub}</span>}
      </Words>
      {end}
    </div>
  );
}

/** A whole row that does something when tapped, like Send a test */
export function SettingButton({
  icon: RowIcon,
  title,
  sub,
  onClick,
  disabled,
}: {
  icon: Icon;
  title: ReactNode;
  sub?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-15 w-full items-center gap-3.5 rounded-lg py-2.5 pr-4 pl-4 text-left outline-none transition-opacity duration-150 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:ring-inset active:opacity-60 disabled:opacity-50"
    >
      <RowIcon aria-hidden className="size-[22px] shrink-0 text-area-fg" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-[650] text-area-fg">{title}</span>
        {sub && (
          <span className="block text-sm text-pretty text-muted-foreground" aria-live="polite">
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}
