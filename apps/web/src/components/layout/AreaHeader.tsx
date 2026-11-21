import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { cn } from "cn";

/**
 * The block of area colour at the top of an overview page (Shopping, Chores, To-dos, Household):
 * a big wide title, the counts that matter, and who shares it. It runs under the status bar. Once
 * the title scrolls away, a 52px bar in the same colour folds down from the top and keeps the
 * title in view.
 */
export function AreaHeader({
  title,
  meta,
  meter,
  right,
}: {
  title: string;
  /** Counts under the title, as <Count> pieces */
  meta?: ReactNode;
  /** A segment per thing, filled for the ones that are done */
  meter?: { done: number; total: number };
  /** Top right: faces, a pill, a menu */
  right?: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const folded = useScrolledPast(titleRef);

  return (
    <>
      <header className="-mx-4 rounded-b-[28px] bg-area pt-[env(safe-area-inset-top)] text-area-on sm:-mx-6 lg:mx-0 lg:mt-0 lg:rounded-[28px]">
        {/* On the narrowest phones the right side wraps under the title rather than break a word */}
        <div className="flex min-h-[3.25rem] flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-1.5 pr-4 pl-5 lg:pt-5">
          <h1 ref={titleRef} className="text-title min-w-0 break-words">
            {title}
          </h1>
          {right && <div className="flex shrink-0 items-center gap-2 pb-1">{right}</div>}
        </div>
        {meta && (
          <p className="flex flex-wrap items-baseline gap-x-[1.125rem] gap-y-1 px-5 pt-2 pb-[1.125rem] text-[0.9375rem] font-medium">
            {meta}
          </p>
        )}
        {meter && meter.total > 0 && <Meter {...meter} className="mx-5 -mt-1 pb-[1.125rem]" />}
        {!meta && !meter && <div className="h-4" />}
      </header>

      {/* The folded bar. A copy of the title, so screen readers skip it. */}
      <div
        aria-hidden
        data-folded={folded || undefined}
        className="pointer-events-none fixed inset-x-0 top-0 z-20 -translate-y-full rounded-b-[22px] bg-area pt-[env(safe-area-inset-top)] text-area-on opacity-0 shadow-[0_10px_24px_-18px_rgb(0_0_0/0.5)] transition-[translate,opacity] duration-200 ease-(--ease-out) data-folded:translate-y-0 data-folded:opacity-100 motion-reduce:translate-y-0 lg:left-64"
      >
        <div className="mx-auto flex h-[3.25rem] max-w-[680px] items-center px-5 sm:px-7 lg:px-9">
          <span className="truncate text-[1.3125rem] font-[820] tracking-[-0.02em] [font-stretch:125%]">
            {title}
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * A filter on the slab: a few 44px segments, the chosen one filled in the slab's text colour. A
 * segment can carry a small count ("Mine 1").
 */
export function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What the segments choose, for screen readers ("Show") */
  label: string;
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex rounded-[14px] bg-black/20 p-[3px]">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-[38px] min-w-11 items-center gap-1.5 rounded-[11px] px-3.5 text-[0.9375rem] font-[650] outline-none transition-[background-color,color,scale] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-area-on/70 active:scale-[0.96] motion-reduce:active:scale-100",
              on ? "bg-area-on text-area" : "text-area-on",
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <i
                className={cn(
                  "grid h-5 min-w-5 place-items-center rounded-full px-[5px] text-xs font-[800] not-italic tabular-nums",
                  on ? "bg-area text-area-on" : "bg-area-on text-area",
                )}
              >
                {option.count}
              </i>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

/** A count in the slab: the number in the wide cut, then what it counts */
export function Count({ value, children }: { value: number; children: ReactNode }) {
  return (
    <span>
      <b className="text-count mr-[5px] text-xl">{value}</b>
      {children}
    </span>
  );
}

// Past this many, segments get too thin to read; the meter becomes one bar that fills
const MAX_SEGMENTS = 24;

/**
 * The meter: one segment per thing, filled for the ones that are done, so a list shows how far
 * the shop has got. Draws in the current text colour.
 */
export function Meter({
  done,
  total,
  className,
  thin = false,
}: {
  done: number;
  total: number;
  className?: string;
  /** The 5px version, for rows */
  thin?: boolean;
}) {
  const label = `${done} of ${total} done`;
  const height = thin ? "h-[5px]" : "h-2";
  if (total > MAX_SEGMENTS) {
    return (
      <div className={cn("flex", className)}>
        <span className="sr-only">{label}</span>
        <div
          aria-hidden
          className={cn("relative flex-1 overflow-hidden rounded-[2px] bg-current/28", height)}
        >
          <div
            className="absolute inset-y-0 left-0 bg-current transition-[width] duration-300 ease-(--ease-out)"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex gap-[3px]", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          aria-hidden
          className={cn(
            "flex-1 rounded-[2px] transition-colors duration-300 ease-(--ease-out)",
            height,
            index < done ? "bg-current" : "bg-current/28",
          )}
        />
      ))}
    </div>
  );
}

/** Whether `ref`'s element has scrolled up under the top of the screen */
function useScrolledPast(ref: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return () => {};
    const observer = new IntersectionObserver(
      ([entry]) =>
        setPast(entry !== undefined && !entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return past;
}

/**
 * The compact bar for a page inside an area (one shopping list): back, the title, and a line of
 * counts with the meter. It stays at the top while the page scrolls, so ten rows fit under it.
 */
export function CompactHeader({
  back,
  title,
  right,
  meta,
  meter,
}: {
  /** The back link, styled as a pill */
  back: ReactNode;
  title: string;
  right?: ReactNode;
  meta?: ReactNode;
  meter?: { done: number; total: number };
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 rounded-b-[22px] bg-area pt-[env(safe-area-inset-top)] text-area-on sm:-mx-6 lg:top-4 lg:mx-0 lg:rounded-[22px]">
      <div className="flex h-[3.25rem] items-center gap-0.5 pr-4 pl-2">
        {back}
        <h1 className="min-w-0 flex-1 truncate pl-1.5 text-[1.3125rem] font-[820] tracking-[-0.02em] [font-stretch:125%]">
          {title}
        </h1>
        {right}
      </div>
      {(meta || meter) && (
        <div className="flex items-center gap-3.5 px-5 pb-3.5 text-sm font-medium whitespace-nowrap">
          {meta}
          {meter && meter.total > 0 && <Meter {...meter} className="flex-1" />}
        </div>
      )}
    </header>
  );
}
