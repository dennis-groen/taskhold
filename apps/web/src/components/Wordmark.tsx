import { useId } from "react";

import { cn } from "cn";

/**
 * The app's mark, a house built from the three area colours stacked like a filling meter
 * (household on top, then chores, then shopping), and its lowercase name in the wide cut.
 */
export function Wordmark({
  className,
  compact = false,
}: {
  className?: string;
  /** The mark above a small name, for the sidebar */
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-[1.375rem] font-[820] tracking-[-0.02em] [font-stretch:125%]",
        compact && "flex-col gap-1.5 text-[0.8125rem]",
        className,
      )}
    >
      <LogoMark className={cn("size-8 shrink-0", compact && "size-9")} />
      taskhold
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  // useId gives characters url(#…) can trip on; keep letters and digits
  const clip = `logo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <clipPath id={clip}>
        <path d="M16 2.4c.7 0 1.3.2 1.8.7l10.4 8.6c.6.5.9 1.2.9 2V27c0 1.2-.9 2.1-2.1 2.1H5c-1.2 0-2.1-.9-2.1-2.1V13.7c0-.8.3-1.5.9-2L14.2 3.1c.5-.5 1.1-.7 1.8-.7z" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="32" height="13.1" fill="var(--home-slab)" />
        <rect y="14.8" width="32" height="5.9" fill="var(--cho-slab)" />
        <rect y="22.4" width="32" height="8" fill="var(--shop-slab)" />
      </g>
    </svg>
  );
}
