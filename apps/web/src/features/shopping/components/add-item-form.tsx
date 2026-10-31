import { PlusIcon } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Type and press Enter: the item goes on the list and the field is ready for the next one */
export function AddItemForm({ onAdd }: { onAdd: (name: string, quantity: string | null) => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      nameRef.current?.focus();
      return;
    }
    onAdd(trimmed, quantity.trim() || null);
    setName("");
    setQuantity("");
    nameRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        ref={nameRef}
        aria-label="Item"
        placeholder="Add an item"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={100}
        autoComplete="off"
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 px-3 text-base md:text-base"
      />
      <Input
        aria-label="Quantity"
        placeholder="Qty"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        maxLength={20}
        autoComplete="off"
        enterKeyHint="done"
        className="h-11 w-16 shrink-0 px-3 text-base md:text-base"
      />
      <Button type="submit" size="lg" className="h-11 shrink-0 px-4">
        <PlusIcon />
        Add
      </Button>
    </form>
  );
}
