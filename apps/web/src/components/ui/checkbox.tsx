import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { CheckIcon } from "@phosphor-icons/react";

/**
 * shadcn's checkbox, plus `variant="done"` (the 44px ring that marks a chore done), `variant="tick"` (the round circle shared rows use to tick something
 * off) and `variant="square"` (the box for private to-dos). Their check mark pops in.
 */
const checkboxVariants = cva(
  "peer relative flex shrink-0 items-center justify-center border border-input transition-[background-color,border-color,box-shadow,scale] duration-200 ease-(--ease-out) outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/80 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
  {
    variants: {
      variant: {
        default: "size-4 rounded-[4px] after:-inset-x-3 after:-inset-y-2",
        // 26px ring in a 44px target: round means shared (shopping, chores), `square` means private
        tick: "size-[26px] rounded-full active:scale-[0.9] active:duration-100 motion-reduce:active:scale-100 border-2 border-line-strong bg-transparent after:-inset-[9px] hover:data-unchecked:border-primary/70 data-checked:border-primary data-checked:bg-primary [&_svg]:size-4 [&_svg]:animate-[check-pop_280ms_var(--ease-out)] motion-reduce:[&_svg]:animate-none",
        // Mark done on a chore: a 44px ring that shows its check before it's pressed
        done: "size-11 rounded-full active:scale-[0.9] active:duration-100 motion-reduce:active:scale-100 border-2 border-area-fg bg-transparent text-area-fg data-checked:border-transparent data-checked:bg-area/20 data-checked:text-area-fg dark:bg-transparent dark:data-checked:bg-area/25 [&_svg]:size-5! data-checked:[&_svg]:animate-[check-pop_280ms_var(--ease-out)] motion-reduce:[&_svg]:animate-none",
        square:
          "size-[26px] rounded-[7px] active:scale-[0.9] active:duration-100 motion-reduce:active:scale-100 border-2 border-line-strong bg-transparent after:-inset-[9px] hover:data-unchecked:border-foreground/60 data-checked:border-foreground data-checked:bg-foreground data-checked:text-background [&_svg]:size-4 [&_svg]:animate-[check-pop_280ms_var(--ease-out)] motion-reduce:[&_svg]:animate-none",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Checkbox({
  className,
  variant,
  ...props
}: CheckboxPrimitive.Root.Props & VariantProps<typeof checkboxVariants>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(checkboxVariants({ variant }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        keepMounted={variant === "done"}
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon weight="bold" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox, checkboxVariants };
