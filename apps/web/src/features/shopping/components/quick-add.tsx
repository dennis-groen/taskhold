import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useRef, useState, type FormEvent, type RefObject } from "react";

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
import { cn } from "@/lib/utils";

import { useAddItem, useChangeError } from "../hooks/use-shopping-list.ts";
import type { ShoppingListSummary } from "../shopping.api.ts";
import { listsQuery } from "../shopping.queries.ts";
import { NewListForm } from "./new-list-form.tsx";

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
        render={
          <Button
            aria-label="Add to a shopping list"
            className="size-14 rounded-full shadow-lg shadow-primary/25"
          />
        }
      >
        <PlusIcon className="size-7" weight="bold" />
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-[640px]" initialFocus={nameRef}>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Add to a shopping list</DrawerTitle>
          <DrawerDescription>
            Type an item and press Enter. The sheet stays open for the next one.
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
  const { error, callbacks } = useChangeError();
  const add = useAddItem(viewer, callbacks);

  if (!lists) return <div className="h-40" />;

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

  const destination =
    lists.find((list) => list.id === picked) ??
    lists.find((list) => list.id === openListId) ??
    lists[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !destination) return;
    add(destination.id, trimmed, quantity.trim() || null);
    setName("");
    setQuantity("");
    setAdded((last) => ({ count: (last?.count ?? 0) + 1, text: `Added to ${destination.name}` }));
    nameRef.current?.focus();
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
          className="h-12 min-w-0 flex-1 px-4 text-base md:text-base"
        />
        <Input
          aria-label="Quantity"
          placeholder="Qty"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          maxLength={20}
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 w-20 shrink-0 px-3 text-base tabular-nums md:text-base"
        />
        <Button type="submit" disabled={!name.trim()} className="h-12 shrink-0 px-5">
          Add
        </Button>
      </div>

      <div className="h-6 pt-1.5 text-sm" aria-live="polite">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          added && (
            <span key={added.count} className="text-primary animate-in fade-in">
              {added.text}
            </span>
          )
        )}
      </div>

      {lists.length > 1 && (
        <fieldset className="mt-1">
          <legend className="sr-only">List</legend>
          <div className="flex flex-wrap gap-2">
            {lists.map((list) => {
              const active = list.id === destination?.id;
              return (
                <Button
                  key={list.id}
                  type="button"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => {
                    setPicked(list.id);
                    nameRef.current?.focus();
                  }}
                  className={cn("h-11 rounded-full px-4")}
                >
                  {list.name}
                </Button>
              );
            })}
          </div>
        </fieldset>
      )}
    </form>
  );
}
