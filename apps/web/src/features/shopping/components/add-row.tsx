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
      className="flex min-h-13 items-center gap-3 pr-2 pl-4"
    >
      <PlusIcon className="size-5 shrink-0 text-primary" weight="bold" aria-hidden />
      <input
        ref={nameRef}
        aria-label={label}
        placeholder={label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-primary focus:placeholder:text-muted-foreground"
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
          className="w-16 shrink-0 rounded-md bg-muted px-2 py-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      )}
      <Button type="submit" size="sm" disabled={pending} className={name.trim() ? "" : "sr-only"}>
        {pending && <Spinner />}
        Add
      </Button>
    </form>
  );
}
