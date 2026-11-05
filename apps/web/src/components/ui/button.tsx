import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * shadcn's button, extended for taskhold:
 * - `soft`: a tinted primary for secondary actions that still belong to the accent
 * - `chip`: a rounded toggle for filters and pickers; set aria-pressed to select it
 * - `fab`: the round + button in the nav
 * - `destructive-ghost`: quiet red text for taking something away; a confirmation or an Undo carries
 *   the weight (delete list, delete account, remove an item)
 * Sizes step up to `xl` (48px), the height of a sheet's main action.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/80 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 motion-reduce:active:not-aria-[haspopup]:scale-100 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.14),0_1px_2px_oklch(0.3_0.05_150/0.22)] hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_10%)] dark:shadow-none dark:hover:bg-[color-mix(in_oklch,var(--primary),white_10%)]",
        soft: "bg-primary-soft text-primary-soft-foreground hover:bg-[color-mix(in_oklch,var(--primary-soft),var(--primary)_12%)]",
        outline:
          "border-border bg-card shadow-[0_1px_1px_oklch(0.4_0.03_60/0.05)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/20 dark:shadow-none dark:hover:bg-input/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/70",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/16 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/18 dark:hover:bg-destructive/26 dark:focus-visible:ring-destructive/40",
        // A quiet way in to something destructive; the confirm dialog carries the loud button
        "destructive-ghost":
          "text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/12 focus-visible:border-destructive/40 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
        chip: "rounded-full border-border bg-card font-medium text-foreground shadow-[0_1px_1px_oklch(0.4_0.03_60/0.05)] hover:bg-muted aria-pressed:border-primary/30 aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-primary-soft-foreground aria-pressed:shadow-none dark:border-input dark:bg-transparent dark:shadow-none dark:hover:bg-input/30 dark:aria-pressed:bg-primary-soft",
        fab: "rounded-full bg-primary text-primary-foreground shadow-fab hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_10%)] active:not-aria-[haspopup]:scale-95 aria-[haspopup]:active:scale-95 dark:hover:bg-[color-mix(in_oklch,var(--primary),white_10%)]",
      },
      size: {
        default:
          "h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "relative h-8 gap-1 after:absolute after:-inset-y-1.5 after:inset-x-0 rounded-[min(var(--radius-md),12px)] px-3 text-[0.8125rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-4.5 text-[0.9375rem] has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5 [&_svg:not([class*='size-'])]:size-[1.125rem]",
        xl: "h-12 gap-2 rounded-xl px-5 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-10",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "relative size-8 after:absolute after:-inset-1.5 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-5",
        // Sits beside a sheet's 48px fields, e.g. the − and + by a quantity
        "icon-xl": "size-12 rounded-xl [&_svg:not([class*='size-'])]:size-5",
        fab: "size-14 [&_svg:not([class*='size-'])]:size-7",
      },
    },
    // Chips are tapped on the move, so they get the full 44px
    compoundVariants: [{ variant: "chip", size: "default", className: "h-11 px-4" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
