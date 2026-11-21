import { toneFor } from "@/lib/member-tone.ts";
import { cn } from "cn";

/**
 * "Everyone's hand": a small dot in the colour of the housemate who ticked something, tucked
 * against the lower left of the tick. The name is always said in words too (the row's byline or
 * its accessible name), so the colour is never the only signal.
 */
export function MemberMark({
  name,
  waiting = false,
  className,
}: {
  name: string;
  /** Saved on this phone, not synced yet: a shape, not a colour, says so (an ink ring and hands) */
  waiting?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-tone={toneFor(name)}
      className={cn(
        // Eases in just after the tick fills, so it reads as "and it was Noor"
        "pointer-events-none absolute bottom-[7px] left-[7px] grid size-3 place-items-center rounded-full bg-(--tone-bg) ring-2 ring-background transition-[scale,opacity] delay-100 duration-200 ease-(--ease-out) starting:scale-50 starting:opacity-0 motion-reduce:transition-none",
        waiting &&
          "bottom-[5px] left-[5px] size-3.5 shadow-[inset_0_0_0_1.5px_var(--color-foreground)]",
        className,
      )}
    >
      {waiting && (
        <svg viewBox="0 0 14 14" className="size-3.5 text-foreground">
          <path
            d="M7 3.6V7l2 1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
