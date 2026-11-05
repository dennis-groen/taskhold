import { PlusIcon } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The first row of a list: type and press Enter, and the field is ready for the next one.
 * With `withQuantity`, a short second field takes "2" or "500 g".
 */
export function AddRow({
  label,
  withQuantity = false,
  pending = false,
  maxLength,
  onAdd,
}: {
  /** Placeholder and accessible name, e.g. "Add item" */
  label: string;
  withQuantity?: boolean;
  pending?: boolean;
  maxLength: number;
  /** Return false to keep what was typed, e.g. when saving failed */
  onAdd: (name: string, quantity: string | null) => void | boolean | Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      nameRef.current?.focus();
      return;
    }
    if ((await onAdd(trimmed, quantity.trim() || null)) === false) return;
    setName("");
    setQuantity("");
    nameRef.current?.focus();
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="group/add flex min-h-14 items-center gap-3 pr-2 pl-4 transition-colors focus-within:bg-primary-soft/35 active:bg-primary-soft/35"
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
}
