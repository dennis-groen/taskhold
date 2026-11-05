import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";

/**
 * The first row of a list: type and press Enter, and the field is ready for the next one.
 * With `withQuantity`, a short second field takes "2" or "500 g".
 * With `renderBelow`, something under the row that can add by name, e.g. suggestions while typing.
 */
export function AddRow({
  label,
  withQuantity = false,
  pending = false,
  maxLength,
  onAdd,
  renderBelow,
}: {
  /** Placeholder and accessible name, e.g. "Add item" */
  label: string;
  withQuantity?: boolean;
  pending?: boolean;
  maxLength: number;
  /** Return false to keep what was typed, e.g. when saving failed */
  onAdd: (name: string, quantity: string | null) => void | boolean | Promise<boolean>;
  /**
   * Rendered under the row. `active` while the row has focus or something typed; `add` adds a
   * name with the quantity typed, the same as typing it and pressing Enter.
   */
  renderBelow?: (field: BelowField) => ReactNode;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [focused, setFocused] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function add(itemName: string) {
    if ((await onAdd(itemName, quantity.trim() || null)) === false) return;
    setName("");
    setQuantity("");
    nameRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      nameRef.current?.focus();
      return;
    }
    await add(trimmed);
  }

  const form = (
    <form
      onSubmit={(event) => void submit(event)}
      className={cn(
        "group/add flex min-h-14 items-center gap-3 pr-2 pl-4",
        // With something below, the whole block lights up instead, so it reads as one row
        !renderBelow && ADDING_TINT,
      )}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground transition-transform duration-200 ease-out group-focus-within/add:rotate-90 motion-reduce:transition-none"
      >
        <PlusIcon className="size-3.5" weight="bold" />
      </span>
      <input
        ref={nameRef}
        aria-label={label}
        placeholder={label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-3 text-base font-medium outline-none placeholder:text-primary-soft-foreground focus:font-normal focus:placeholder:font-normal focus:placeholder:text-muted-foreground"
      />
      {withQuantity && (
        <input
          aria-label="Quantity"
          placeholder="Qty"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          maxLength={20}
          autoComplete="off"
          enterKeyHint="done"
          className="h-10 w-18 shrink-0 rounded-lg bg-muted px-2.5 text-right text-base tabular-nums md:text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/80 dark:bg-input/30"
        />
      )}
      <Button
        type="submit"
        disabled={pending}
        // Hidden until there's something to add, but never focused while invisible
        className={
          name.trim() ? "animate-in fade-in zoom-in-95 duration-150" : "sr-only focus:not-sr-only"
        }
      >
        {pending && <Spinner />}
        Add
      </Button>
    </form>
  );
  if (!renderBelow) return form;

  return (
    <div
      className={ADDING_TINT}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {form}
      <Below
        render={renderBelow}
        typed={name}
        active={focused || name.trim() !== ""}
        add={(itemName) => void add(itemName)}
      />
    </div>
  );
}

/** The soft tint while someone is adding */
const ADDING_TINT = "transition-colors focus-within:bg-primary-soft/35 active:bg-primary-soft/35";

type BelowField = { typed: string; active: boolean; add: (name: string) => void };

/** Calls `renderBelow` as its own component, so `add` is only ever run from an event */
function Below({ render, ...field }: BelowField & { render: (field: BelowField) => ReactNode }) {
  return render(field);
}
