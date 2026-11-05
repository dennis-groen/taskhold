import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { MinusIcon, PlusIcon, TrashIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { stepQuantity } from "../item-quantity.ts";
import type { ItemChanges } from "../shopping.mutations.ts";
import type { ShoppingItem } from "../shopping.api.ts";

/**
 * Fix an item after adding it: its name, its quantity (− and + count it without the keyboard),
 * or take it off the list. Saving closes the sheet straight away; the change shows on the list
 * at once and is sent like a tick, so it works without signal too.
 */
export function EditItemSheet({
  item,
  onSave,
  onRemove,
  onClose,
}: {
  /** The item to change; null keeps the sheet closed */
  item: ShoppingItem | null;
  /** Gets only the fields that changed, and isn't called when nothing did */
  onSave: (changes: ItemChanges) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Keeps showing the last item while the sheet slides away, instead of collapsing as it goes
  const [shown, setShown] = useState(item);
  if (item !== null && item !== shown) setShown(item);

  return (
    <Drawer open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        className="mx-auto max-w-[640px]"
        // With a keyboard or mouse, ready to type. On a phone the keyboard would cover the − and
        // +, which are what you came for most of the time, so nothing pops up until you tap a field.
        initialFocus={(type) => (type === "touch" ? formRef.current : nameRef.current)}
      >
        {shown && (
          <EditItemForm
            // Fresh fields for each item
            key={shown.id}
            item={shown}
            nameRef={nameRef}
            formRef={formRef}
            onSave={(changes) => {
              onSave(changes);
              onClose();
            }}
            onRemove={() => {
              onRemove();
              onClose();
            }}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function EditItemForm({
  item,
  nameRef,
  formRef,
  onSave,
  onRemove,
}: {
  item: ShoppingItem;
  nameRef: RefObject<HTMLInputElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  onSave: (changes: ItemChanges) => void;
  onRemove: () => void;
}) {
  const ids = { name: useId(), quantity: useId(), error: useId() };
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [error, setError] = useState<string | null>(null);
  const fewer = stepQuantity(quantity, -1);
  const more = stepQuantity(quantity, 1);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Type what you need.");
      nameRef.current?.focus();
      return;
    }
    const trimmedQuantity = quantity.trim() || null;
    onSave({
      ...(trimmedName !== item.name && { name: trimmedName }),
      ...(trimmedQuantity !== item.quantity && { quantity: trimmedQuantity }),
    });
  }

  return (
    <>
      <DrawerHeader className="px-5 pt-5 text-left">
        <DrawerTitle>Edit item</DrawerTitle>
        <DrawerDescription>Everyone in your household sees the change.</DrawerDescription>
      </DrawerHeader>

      <form
        ref={formRef}
        tabIndex={-1}
        onSubmit={submit}
        className="flex flex-col gap-6 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.name}>Item</Label>
          <Input
            id={ids.name}
            ref={nameRef}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            maxLength={100}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? ids.error : undefined}
            className="h-12 rounded-xl px-4 text-base md:text-base"
          />
          {error && (
            <p id={ids.error} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.quantity}>Quantity</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-label="One fewer"
              aria-controls={ids.quantity}
              disabled={fewer === null}
              onClick={() => fewer !== null && setQuantity(fewer)}
            >
              <MinusIcon weight="bold" />
            </Button>
            <Input
              id={ids.quantity}
              placeholder="2, 500 g, a few"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              maxLength={20}
              autoComplete="off"
              enterKeyHint="done"
              className="h-12 min-w-0 flex-1 rounded-xl px-4 text-center text-base tabular-nums md:text-base"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-label="One more"
              aria-controls={ids.quantity}
              disabled={more === null}
              onClick={() => more !== null && setQuantity(more)}
            >
              <PlusIcon weight="bold" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button type="submit" size="xl">
            Save
          </Button>
          <Button type="button" variant="destructive-ghost" size="xl" onClick={onRemove}>
            <TrashIcon />
            Remove from list
          </Button>
        </div>
      </form>
    </>
  );
}
