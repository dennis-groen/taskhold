import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { cn } from "cn";

import { SHEET_BODY, SheetContent, SheetEyebrow } from "@/components/layout/Sheet.tsx";
import { BasketIcon, MinusIcon, PlusIcon } from "@/components/icons.ts";
import { UserAvatar } from "@/components/UserAvatar.tsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pastDateLabel, today } from "@/lib/dates.ts";
import { firstName } from "@/lib/shared-with.ts";

import { categorize } from "../categories.ts";
import { stepQuantity } from "../item-quantity.ts";
import type { ItemChanges } from "../shopping.changes.ts";
import type { ShoppingItem } from "../shopping.api.ts";

/**
 * Fix an item after adding it: its name, its quantity (− and + count it without the keyboard),
 * or take it off the list. Saving closes the sheet straight away; the change shows on the list
 * at once and is sent like a tick, so it works without signal too.
 */
export function EditItemSheet({
  item,
  listName,
  viewerId,
  onSave,
  onRemove,
  onClose,
}: {
  /** The item to change; null keeps the sheet closed */
  item: ShoppingItem | null;
  /** Shown above the item, with its section: "Groceries · Dairy & Eggs" */
  listName: string;
  viewerId: string;
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
      <SheetContent
        // With a keyboard or mouse, ready to type. On a phone the keyboard would cover the − and
        // +, which are what you came for most of the time, so nothing pops up until you tap a field.
        initialFocus={(type) => (type === "touch" ? formRef.current : nameRef.current)}
      >
        {shown && (
          <EditItemForm
            // Fresh fields for each item
            key={shown.id}
            item={shown}
            listName={listName}
            viewerId={viewerId}
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
      </SheetContent>
    </Drawer>
  );
}

function EditItemForm({
  item,
  listName,
  viewerId,
  nameRef,
  formRef,
  onSave,
  onRemove,
}: {
  item: ShoppingItem;
  listName: string;
  viewerId: string;
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
      <SheetEyebrow icon={BasketIcon}>
        {listName} · {categorize(item.name)}
      </SheetEyebrow>
      <DrawerTitle className="sr-only">Edit {item.name}</DrawerTitle>
      <DrawerDescription className="sr-only">
        Everyone in your household sees the change.
      </DrawerDescription>

      <form
        ref={formRef}
        tabIndex={-1}
        onSubmit={submit}
        className={cn(
          "flex flex-col gap-6 overflow-y-auto overscroll-contain outline-none",
          SHEET_BODY,
        )}
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
            className="h-14 rounded-2xl border-transparent bg-muted px-4 text-lg font-semibold md:text-lg dark:bg-muted"
          />
          {error && (
            <p id={ids.error} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.quantity}>Amount</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-label="One fewer"
              className="size-14 rounded-2xl"
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
              className="h-14 min-w-0 flex-1 rounded-2xl border-transparent bg-muted px-4 text-center text-lg font-semibold tabular-nums md:text-lg dark:bg-muted"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-label="One more"
              className="size-14 rounded-2xl"
              aria-controls={ids.quantity}
              disabled={more === null}
              onClick={() => more !== null && setQuantity(more)}
            >
              <PlusIcon weight="bold" />
            </Button>
          </div>
          <p className="text-[0.8125rem] text-muted-foreground">
            Optional. Anything goes: 2, 500 g, a few.
          </p>
        </div>

        {item.addedBy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserAvatar name={item.addedBy.name} image={null} size="sm" />
            {item.addedBy.id === viewerId ? "You" : firstName(item.addedBy.name)} added it{" "}
            {addedWhen(item.createdAt)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" size="xl">
            Save
          </Button>
          <Button type="button" variant="secondary" size="xl" onClick={onRemove}>
            Delete item
          </Button>
        </div>
      </form>
    </>
  );
}

/** "today", "yesterday", "on Tuesday" within the week, "on 14 Nov" before that */
function addedWhen(createdAt: string): string {
  const on = today();
  const day = Temporal.Instant.from(createdAt).toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const date = day.toPlainDate().toString();
  const label = pastDateLabel(date, on);
  if (label === "today" || label === "yesterday") return label;
  const days = Temporal.PlainDate.from(date).until(Temporal.PlainDate.from(on)).days;
  return days < 7
    ? `on ${day.toLocaleString("en", { weekday: "long" })}`
    : `on ${day.toLocaleString("en-GB", { day: "numeric", month: "short" })}`;
}
