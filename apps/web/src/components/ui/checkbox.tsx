import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { CheckIcon } from "@phosphor-icons/react";

/**
 * shadcn's checkbox, plus `variant="tick"`: the round circle every list row uses to tick
 * something off. Its check mark pops in.
 */
const checkboxVariants = cva(
  "peer relative flex shrink-0 items-center justify-center border border-input transition-[background-color,border-color,box-shadow] duration-200 ease-out outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/80 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
  {
    variants: {
      variant: {
        default: "size-4 rounded-[4px] after:-inset-x-3 after:-inset-y-2",
        tick: "size-6 rounded-full border-[1.5px] border-[color-mix(in_oklch,var(--input),var(--foreground)_35%)] bg-card after:-inset-3 hover:data-unchecked:border-primary/70 hover:data-unchecked:bg-primary-soft/60 dark:bg-transparent [&_svg]:size-3.5 [&_svg]:animate-[check-pop_280ms_var(--ease-out-quint)] motion-reduce:[&_svg]:animate-none",
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
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon weight="bold" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox, checkboxVariants };
