/** Shown while a page's data loads (the router's pending component): its shape, breathing */
export function PageSkeleton() {
  return (
    <output
      aria-label="Loading"
      className="block motion-safe:animate-[skeleton-breathe_1.6s_ease-in-out_infinite]"
    >
      <div className="h-8 w-40 rounded-lg bg-foreground/8" />
      <div className="mt-3 h-4 w-28 rounded-md bg-foreground/6" />
      <div className="mt-7 divide-y divide-border/80 overflow-hidden rounded-xl bg-card shadow-card">
        {["w-[62%]", "w-[45%]", "w-[70%]", "w-[38%]"].map((width) => (
          <div key={width} className="flex h-13 items-center gap-3 px-4">
            <span className="size-6 shrink-0 rounded-full bg-foreground/7" />
            <span className={`h-3.5 rounded-md bg-foreground/7 ${width}`} />
          </div>
        ))}
      </div>
    </output>
  );
}
