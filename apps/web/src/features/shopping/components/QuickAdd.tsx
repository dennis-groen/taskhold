import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useRef, useState, type FormEvent, type ReactElement, type RefObject } from "react";

import { cn } from "cn";

import { SHEET_BODY, SheetContent } from "@/components/layout/Sheet.tsx";
import { CheckIcon } from "@/components/icons.ts";
import { JotButton } from "@/components/JotButton.tsx";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { Entry } from "../item-entry.ts";
import { useAddEntry, useAddItem, useBuyAgain, useEditItem } from "../shopping.hooks.ts";
import type { ShoppingListSummary } from "../shopping.api.ts";
import { listQuery, listsQuery } from "../shopping.queries.ts";
import { AlreadyOnList } from "./AlreadyOnList.tsx";
import { BuyAgain } from "./BuyAgain.tsx";
import { NewListForm } from "./NewListForm.tsx";

/**
 * The add field in the dock and the sheet it opens: add items to any list from anywhere in the
 * app. Adds to the list that's open, or the first list, unless you pick another.
 */
export function QuickAdd({
  viewer,
  trigger,
}: {
  viewer: { id: string; name: string };
  /** What opens the sheet; the dock's add field when left out */
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  // Loaded before the sheet opens, so the field is there to take focus straight away
  const { data: lists } = useQuery(listsQuery());
  const openListId = useParams({ strict: false }).listId;
  const nameRef = useRef<HTMLInputElement>(null);
  const target = lists?.find((list) => list.id === openListId) ?? lists?.[0];

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={trigger ?? <JotButton label={target ? `Add to ${target.name}` : "Add to a list"} />}
      />
      <SheetContent initialFocus={nameRef}>
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
      </SheetContent>
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
  // What the last add did, counted so the same message animates in again
  const [notice, setNotice] = useState<Notice | null>(null);
  // Chips tapped in this sheet, per list, so one leaves the row at once, even before that list
  // has loaded and can say it's on there
  const [tapped, setTapped] = useState<string[]>([]);
  const addEntry = useAddEntry(viewer);
  const addAnyway = useAddItem(viewer);

  const destination =
    lists?.find((list) => list.id === picked) ??
    lists?.find((list) => list.id === openListId) ??
    lists?.[0];
  const suggestions = useBuyAgain(destination?.id, name).filter(
    (suggestion) => !tapped.includes(`${destination?.id}:${suggestion}`),
  );
  const edit = useEditItem(destination?.id);
  // Already loaded for "buy again"; read here so the notice follows housemates' changes
  const { data: destinationList } = useQuery({
    ...listQuery(destination?.id ?? ""),
    enabled: destination !== undefined,
  });
  const alreadyOn =
    notice?.kind === "already" && notice.listId === destination?.id
      ? destinationList?.items.find((item) => item.id === notice.itemId && !item.checked)
      : undefined;

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

  /**
   * Adds to the chosen list with what's in the quantity field, unless the list already has it,
   * then clears both fields
   */
  function addToList(itemName: string) {
    if (!destination) return;
    const result = addEntry(destination.id, itemName, quantity);
    setName("");
    setQuantity("");
    setNotice((last) => {
      const count = (last?.count ?? 0) + 1;
      return result.kind === "already"
        ? {
            count,
            kind: "already",
            listId: destination.id,
            itemId: result.item.id,
            entry: result.entry,
          }
        : { count, kind: "said", text: `Added ${result.entry.name} to ${destination.name}` };
    });
    nameRef.current?.focus();
  }

  function say(text: string) {
    setNotice((last) => ({ count: (last?.count ?? 0) + 1, kind: "said", text }));
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
    <form onSubmit={submit} className={cn(SHEET_BODY, "pt-5")}>
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

      <div className="min-h-6 pt-1.5 text-sm" aria-live="polite">
        {notice?.kind === "said" && (
          <span
            key={notice.count}
            className="inline-flex items-center gap-1 font-medium text-primary-soft-foreground animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            <CheckIcon className="size-4" weight="bold" aria-hidden />
            {notice.text}
          </span>
        )}
        {notice?.kind === "already" && alreadyOn && destination && (
          <AlreadyOnList
            key={notice.count}
            item={alreadyOn}
            entry={notice.entry}
            onSetQuantity={(nextQuantity) => {
              edit(alreadyOn.id, { quantity: nextQuantity });
              say(`${alreadyOn.name} is now ${nextQuantity}`);
            }}
            onAddAnyway={() => {
              addAnyway(destination.id, notice.entry.name, notice.entry.quantity);
              say(`Added ${notice.entry.name} to ${destination.name}`);
            }}
          />
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

type Notice =
  | { count: number; kind: "said"; text: string }
  | { count: number; kind: "already"; listId: string; itemId: string; entry: Entry };
