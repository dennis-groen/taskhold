import { cn } from "cn";

/** The app's mark (a house with a tick, as in the app icon) and its lowercase name */
export function Wordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-heading text-[1.0625rem] font-bold tracking-[-0.02em]",
        compact && "flex-col gap-1.5 text-[0.8125rem]",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", compact && "size-9")}>
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <path
          d="M16 6.5 25.5 14.2v10.3a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V14.2Z"
          className="fill-primary-foreground stroke-primary-foreground"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="m11.75 18.5 3 3 5.5-5.75"
          fill="none"
          className="stroke-primary"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      taskhold
    </span>
  );
}
