import type { ComponentProps, ReactNode } from "react";

import { BroomIcon, LockIcon, XIcon, type Icon } from "@/components/icons.ts";
import { SHEET_ICON_BUTTON } from "@/components/layout/Sheet.tsx";
import { DrawerClose } from "@/components/ui/drawer";
import { cn } from "cn";

export type AddKind = "chore" | "todo";

const KINDS: { kind: AddKind; label: string; icon: Icon }[] = [
  { kind: "chore", label: "Chore", icon: BroomIcon },
  { kind: "todo", label: "To-do", icon: LockIcon },
];

/**
 * The top of the add sheet: Chore or To-do, which keeps what's typed, and ✕ to close without
 * dragging. Without `onKind` it's only the ✕.
 */
export function AddSheetTop({ kind, onKind }: { kind: AddKind; onKind?: (kind: AddKind) => void }) {
  return (
    <div className="flex items-center gap-2 pt-3 pr-3 pl-5">
      {onKind ? (
        <fieldset className="flex flex-1 rounded-[16px] bg-muted p-1">
          <legend className="sr-only">Add a</legend>
          {KINDS.map(({ kind: option, label, icon: KindIcon }) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => onKind(option)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] text-[0.9375rem] font-[700] outline-none transition-[background-color,color,box-shadow] duration-200 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80",
                kind === option
                  ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-input"
                  : "text-muted-foreground",
              )}
            >
              <KindIcon
                aria-hidden
                weight="bold"
                className={cn("size-5", kind === option && option === "chore" && "text-area-fg")}
              />
              {label}
            </button>
          ))}
        </fieldset>
      ) : (
        <span className="flex-1" />
      )}
      <DrawerClose aria-label="Close" className={SHEET_ICON_BUTTON}>
        <XIcon weight="bold" className="size-6" />
      </DrawerClose>
    </div>
  );
}

/** The title typed big, as it will read on the list */
export function BigTitleInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      autoComplete="off"
      enterKeyHint="done"
      className={cn(
        "w-full bg-transparent text-[2rem] leading-tight font-[850] tracking-[-0.02em] outline-none [font-stretch:118%] placeholder:text-muted-foreground/50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One of the tiles under the title (Who, Due, Repeat): its name small, its value big. Tapping it
 * opens its choices under the row.
 */
export function Tile({
  icon,
  label,
  value,
  open,
  onClick,
  controls,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  open: boolean;
  onClick: () => void;
  /** The id of the choices it opens */
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        "min-w-0 flex-auto rounded-[16px] px-3.5 py-2.5 text-left outline-none transition-[background-color,box-shadow,scale] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.97] motion-reduce:active:scale-100",
        open ? "bg-area-tint shadow-[inset_0_0_0_2px_var(--color-area-fg)]" : "bg-muted",
      )}
    >
      <span className="flex items-center gap-1.5 text-[0.8125rem] font-[600] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[1.0625rem] font-[750]">{value}</span>
    </button>
  );
}

/** Choices in a row, one picked: Once or Every…, days or weeks */
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex rounded-[14px] bg-muted p-1", className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[0.9375rem] font-[650] whitespace-nowrap outline-none transition-[background-color,color] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80",
            value === option.value
              ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-input"
              : "text-muted-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
