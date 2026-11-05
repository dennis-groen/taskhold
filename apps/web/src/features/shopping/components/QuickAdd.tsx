import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useRef, useState, type FormEvent, type RefObject } from "react";

import { CheckIcon, PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { useAddItem, useBuyAgain } from "../shopping.hooks.ts";
import type { ShoppingListSummary } from "../shopping.api.ts";
import { listsQuery } from "../shopping.queries.ts";
import { BuyAgain } from "./BuyAgain.tsx";
import { NewListForm } from "./NewListForm.tsx";

/**
 * The round + button and the sheet it opens: add items to any list from anywhere in the app.
 * Adds to the list that's open, or the first list, unless you pick another.
 */
export function QuickAdd({ viewer }: { viewer: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  // Loaded before the sheet opens, so the field is there to take focus straight away
  const { data: lists } = useQuery(listsQuery());
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={<Button aria-label="Add to a shopping list" variant="fab" size="fab" />}
      >
        <PlusIcon weight="bold" />
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-[640px]" initialFocus={nameRef}>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Add to a shopping list</DrawerTitle>
          <DrawerDescription>
            Type an item and press Enter, or pick one you bought before. The sheet stays open for
            the next one.
          </DrawerDescription>
        </DrawerHeader>
        {/* Mounted only while open, so it starts fresh each time */}
        {open && (
          <QuickAddForm
            viewer={viewer}
            lists={lists}
            nameRef={nameRef}
            onListCreated={() => setOpen(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function QuickAddForm({
  viewer,
  lists,
  nameRef,
  onListCreated,
}: {
  viewer: { id: string; name: string };
  lists: ShoppingListSummary[] | undefined;
  nameRef: RefObject<HTMLInputElement | null>;
  onListCreated: () => void;
}) {
  const openListId = useParams({ strict: false }).listId;
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [added, setAdded] = useState<{ count: number; text: string } | null>(null);
  // Chips tapped in this sheet, per list, so one leaves the row at once, even before that list
  // has loaded and can say it's on there
  const [tapped, setTapped] = useState<string[]>([]);
  const add = useAddItem(viewer);

  const destination =
    lists?.find((list) => list.id === picked) ??
    lists?.find((list) => list.id === openListId) ??
    lists?.[0];
  const suggestions = useBuyAgain(destination?.id, name).filter(
    (suggestion) => !tapped.includes(`${destination?.id}:${suggestion}`),
  );

  if (!lists)
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );

  if (lists.length === 0) {
    return (
      <div className="px-1 pt-4 pb-6">
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          Make a list first, then add what you need.
        </p>
        <NewListForm onCreated={onListCreated} />
      </div>
    );
  }

  /** Adds to the chosen list with what's in the quantity field, then clears both fields */
  function addToList(itemName: string) {
    if (!destination) return;
    add(destination.id, itemName, quantity.trim() || null);
    setName("");
    setQuantity("");
    setAdded((last) => ({
      count: (last?.count ?? 0) + 1,
      text: `Added ${itemName} to ${destination.name}`,
    }));
    nameRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) addToList(trimmed);
  }

  function pick(itemName: string) {
    if (!destination) return;
    setTapped((names) => [...names, `${destination.id}:${itemName}`]);
    addToList(itemName);
  }

  return (
    <form onSubmit={submit} className="px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <Input
          ref={nameRef}
          aria-label="Item"
          placeholder={`Add to ${destination?.name ?? "the list"}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-xl px-4 text-base md:text-base"
        />
        <Input
          aria-label="Quantity"
          placeholder="Qty"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          maxLength={20}
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 w-20 shrink-0 rounded-xl px-3 text-base tabular-nums md:text-base"
        />
        <Button type="submit" size="xl" disabled={!name.trim()}>
          Add
        </Button>
      </div>

      <div className="h-6 pt-1.5 text-sm" aria-live="polite">
        {added && (
          <span
            key={added.count}
            className="inline-flex items-center gap-1 font-medium text-primary-soft-foreground animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            <CheckIcon className="size-4" weight="bold" aria-hidden />
            {added.text}
          </span>
        )}
      </div>

      <BuyAgain names={suggestions} onPick={pick} gutter="sheet" className="mt-2 mb-5" />

      {lists.length > 1 && (
        <fieldset className="mt-1">
          <legend className="pb-2 text-[0.8125rem] leading-4 font-semibold text-muted-foreground">
            Add to
          </legend>
          <div className="flex flex-wrap gap-2">
            {lists.map((list) => {
              const active = list.id === destination?.id;
              return (
                <Button
                  key={list.id}
                  type="button"
                  variant="chip"
                  aria-pressed={active}
                  onClick={() => {
                    setPicked(list.id);
                    nameRef.current?.focus();
                  }}
                  className="h-11 max-w-full"
                >
                  <span className="truncate">{list.name}</span>
                </Button>
              );
            })}
          </div>
        </fieldset>
      )}
    </form>
  );
}
