import { Link, type LinkProps } from "@tanstack/react-router";
import { useId, type ComponentProps, type ReactNode } from "react";

import { CaretRightIcon, type Icon } from "@/components/icons.ts";
import { cn } from "cn";

/**
 * The front of every settings row: a 40px slot, the width of a face, so icon rows and people rows
 * share one text column. Holds an icon, or a face in its place.
 */
function Lead({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center">
      {children}
    </span>
  );
}

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
      <Lead>
        <RowIcon
          className={cn(
            "size-[22px]",
            tone === "muted" ? "text-muted-foreground" : "text-foreground",
          )}
        />
      </Lead>
      <Words htmlFor={htmlFor} className="min-w-0 flex-1">
        <span className="block text-base font-[650]">{title}</span>
        {sub && <span className="block text-sm text-pretty text-muted-foreground">{sub}</span>}
      </Words>
      {end}
    </div>
  );
}

/**
 * How a tappable row reads: "plain" goes somewhere or changes a setting, "accent" (the area's
 * colour) offers something to do, "danger" takes something away and always asks first
 */
type RowTone = "plain" | "accent" | "danger";

const TONE: Record<RowTone, { icon: string; title: string }> = {
  plain: { icon: "text-foreground", title: "" },
  accent: { icon: "text-area-fg", title: "text-area-fg" },
  danger: { icon: "text-destructive", title: "text-destructive" },
};

// The press tint and focus ring are drawn on a rounded layer behind the row (`before:`), so they
// read as a shape just inside the screen edge while the row itself, and the hairline a Group draws
// on it, stay square
const PRESSABLE =
  "relative isolate flex min-h-15 w-full items-center gap-3.5 py-2.5 pr-4 pl-4 text-left outline-none transition-opacity duration-150 before:absolute before:inset-0 before:-z-10 before:rounded-lg before:transition-[background-color] before:duration-150 before:ease-(--ease-out) hover:before:bg-muted/60 focus-visible:before:ring-3 focus-visible:before:ring-ring/80 focus-visible:before:ring-inset active:before:bg-muted disabled:pointer-events-none disabled:opacity-50";

/**
 * The words of a tappable row. The title names the row; the sub only describes it, so screen
 * readers hear "Notifications, link" and then the details, not one long name.
 */
function RowWords({
  icon: RowIcon,
  leading,
  title,
  sub,
  tone,
  titleId,
  subId,
  liveSub = false,
}: {
  icon?: Icon;
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  tone: RowTone;
  titleId: string;
  subId: string;
  liveSub?: boolean;
}) {
  return (
    <>
      <Lead>
        {leading ?? (RowIcon && <RowIcon className={cn("size-[22px]", TONE[tone].icon)} />)}
      </Lead>
      <span className="min-w-0 flex-1">
        <span
          id={titleId}
          className={cn(
            "block text-base font-[650]",
            // A danger row's title says exactly what goes, so it wraps rather than lose the end
            tone === "danger" ? "break-words" : "truncate",
            TONE[tone].title,
          )}
        >
          {title}
        </span>
        {sub && (
          <span
            id={subId}
            className="block text-sm text-pretty text-muted-foreground"
            aria-live={liveSub ? "polite" : undefined}
          >
            {sub}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * A row that opens a page of its own, with what it's set to now at the end: "Notifications On ›".
 * New settings go behind one of these, so the Household page stays one screen however many there
 * are.
 */
export function SettingLink({
  to,
  icon,
  leading,
  title,
  sub,
  value,
  tone = "plain",
}: {
  to: LinkProps["to"];
  icon?: Icon;
  /** In place of the icon, e.g. a face */
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  /** What it's set to now, quiet at the end */
  value?: ReactNode;
  tone?: Exclude<RowTone, "danger">;
}) {
  const id = useId();
  const described = [value && `${id}-value`, sub && `${id}-sub`].filter(Boolean).join(" ");
  return (
    <Link
      to={to}
      className={PRESSABLE}
      aria-labelledby={`${id}-title`}
      aria-describedby={described || undefined}
    >
      <RowWords
        icon={icon}
        leading={leading}
        title={title}
        sub={sub}
        tone={tone}
        titleId={`${id}-title`}
        subId={`${id}-sub`}
      />
      {value && (
        <span
          id={`${id}-value`}
          className="max-w-[40%] shrink-0 truncate text-[0.9375rem] font-medium text-muted-foreground"
        >
          {value}
        </span>
      )}
      <CaretRightIcon
        aria-hidden
        weight="bold"
        className="-mr-1 size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

/**
 * A whole row that does something when tapped, like Send a test. It can be a dialog's trigger:
 * the extra button props (and `onClick`) pass through. `liveSub` reads out changes to the line
 * under the title, for a row that reports back there (Send a test).
 */
export function SettingButton({
  icon,
  title,
  sub,
  tone = "accent",
  liveSub = false,
  className,
  ...props
}: Omit<ComponentProps<"button">, "title"> & {
  icon: Icon;
  title: ReactNode;
  sub?: ReactNode;
  tone?: RowTone;
  liveSub?: boolean;
}) {
  const id = useId();
  return (
    <button
      type="button"
      className={cn(PRESSABLE, className)}
      aria-labelledby={`${id}-title`}
      aria-describedby={sub ? `${id}-sub` : undefined}
      {...props}
    >
      <RowWords
        icon={icon}
        title={title}
        sub={sub}
        tone={tone}
        titleId={`${id}-title`}
        subId={`${id}-sub`}
        liveSub={liveSub}
      />
    </button>
  );
}
