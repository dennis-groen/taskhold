import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from "react";

import { ClockCounterClockwiseIcon, InfoIcon, PlusIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";
import { firstName, type PersonSummary } from "@/lib/shared-with.ts";
import { cn } from "cn";

import { categorize } from "../categories.ts";
import { findOnList, parseEntry, type Entry } from "../item-entry.ts";
import type { ShoppingItem } from "../shopping.api.ts";
import {
  useAddItem,
  useBuyAgain,
  useBuyAgainDueCount,
  useBuyAgainHistoryCount,
  useBuyAgainState,
  useEditItem,
  useManageLists,
  useToggleItem,
  useUndoAddItem,
} from "../shopping.hooks.ts";
import { listQuery } from "../shopping.queries.ts";
import { stepQuantity } from "../item-quantity.ts";
import { BuyAgainChips } from "./BuyAgainChips.tsx";
import { BuyAgainSheet } from "./BuyAgainSheet.tsx";

/**
 * Shopping's part of the dock. On a list: Buy again chips over a field that adds straight to it,
 * catching what's already there. On the overview: a field that starts a new list and opens it.
 */
export function ShopDock({ viewer }: { viewer: PersonSummary }) {
  const listId = useParams({ strict: false }).listId;
  return listId ? <ItemField key={listId} listId={listId} viewer={viewer} /> : <NewListField />;
}

/** The field's shell: the + that sends it and the input */
function DockForm({
  onSubmit,
  canSubmit,
  submitLabel,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canSubmit: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex h-[52px] w-full items-center gap-2 rounded-[22px] bg-dock-field pr-1 pl-1.5 focus-within:ring-2 focus-within:ring-area/40 lg:bg-muted"
    >
      <button
        type="submit"
        aria-label={submitLabel}
        disabled={!canSubmit}
        // Keeps the keyboard up for the next one
        onMouseDown={(event) => event.preventDefault()}
        className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-primary text-primary-foreground outline-none transition-[scale,opacity] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.92] disabled:opacity-100 motion-reduce:active:scale-100"
      >
        <PlusIcon weight="bold" className="size-[22px]" />
      </button>
      {children}
    </form>
  );
}

const FIELD =
  "h-full min-w-0 flex-1 bg-transparent pr-3 text-[1.0625rem] outline-none placeholder:text-muted-foreground";

/** On the overview: type a name, and the list is made and opened */
function NewListField() {
  const navigate = useNavigate();
  const { create } = useManageLists();
  const [name, setName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const listId = create(trimmed);
    setName("");
    void navigate({ to: "/lists/$listId", params: { listId } });
  }

  return (
    <DockForm onSubmit={submit} canSubmit={name.trim() !== ""} submitLabel="Make list">
      <input
        aria-label="New list"
        placeholder="New list"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        autoComplete="off"
        enterKeyHint="go"
        className={FIELD}
      />
    </DockForm>
  );
}

/** What the last add ran into: the same thing on the list already, waiting or ticked */
type Clash = { item: ShoppingItem; entry: Entry };

/**
 * On a list: adds what's typed to it. While typing, a card says how it'll be read ("Adds Oat milk
 * · 2 to Dairy & Eggs") and the chips narrow to match. Something the list has already isn't added
 * twice: a card offers to change its amount, untick it, or add a new row anyway.
 */
function ItemField({ listId, viewer }: { listId: string; viewer: PersonSummary }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");
  const [focused, setFocused] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [clash, setClash] = useState<Clash | null>(null);
  const { data: list } = useQuery(listQuery(listId));
  const add = useAddItem(viewer);
  const undoAdd = useUndoAddItem();
  const edit = useEditItem(listId);
  const toggle = useToggleItem(listId, viewer);
  const historyCount = useBuyAgainHistoryCount();
  const dueCount = useBuyAgainDueCount(listId);
  const entry = typed.trim() ? parseEntry(typed) : null;
  const isTyping = Boolean(entry?.name);
  const { pinnedIds, addedIdFor, markAdded, clearAdded } = useBuyAgainState(listId);
  const suggestions = useBuyAgain(listId, entry?.name ?? "", pinnedIds);
  const chips = suggestions.map(({ name, quantity }) => ({
    name,
    added: !isTyping && addedIdFor(name) !== undefined,
    quantity: isTyping ? (entry?.quantity ?? quantity) : quantity,
  }));
  // Keep the dock slim while ticking items in the aisle; reveal quick chips once focused or typing
  const showChips = isTyping || focused;
  // The clash card follows housemates' changes while it's up
  const clashing = clash && list?.items.find((item) => item.id === clash.item.id);

  function addEntry(next: Entry, { focus = true }: { focus?: boolean } = {}): string | null {
    const existing = list && findOnList(list.items, next.name);
    let addedId: string | null = null;
    if (existing) {
      setClash({ item: existing, entry: next });
    } else {
      addedId = add(listId, next.name, next.quantity);
      setClash(null);
    }
    setTyped("");
    if (focus) inputRef.current?.focus();
    return addedId;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entry?.name) addEntry(entry);
  }

  function pickChip(name: string) {
    const usualQuantity = suggestions.find((item) => item.name === name)?.quantity ?? null;
    const id = addEntry(
      { name, quantity: isTyping ? (entry?.quantity ?? usualQuantity) : usualQuantity },
      // Idle chips shouldn't pop up the keyboard when the input wasn't focused; BuyAgainChips's
      // preventDefault on mousedown already keeps it up when it was
      { focus: isTyping },
    );
    if (id && !isTyping) markAdded(name, id);
  }

  function undoChip(name: string) {
    const id = addedIdFor(name);
    clearAdded(name);
    if (id) undoAdd(listId, id);
  }

  function openRestock() {
    setFocused(false);
    inputRef.current?.blur();
    setRestockOpen(true);
  }

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.target)) {
      setFocused(true);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocused(false);
    }
  }

  if (!list) return null;

  const chipsVisible = showChips && chips.length > 0;

  return (
    <>
      <div onFocus={handleFocus} onBlur={handleBlur} className="flex flex-col">
        {clash && clashing ? (
          <div className="mb-1.5">
            <ClashCard
              item={clashing}
              entry={clash.entry}
              viewerId={viewer.id}
              onUntick={() => {
                toggle(clashing.id, false);
                setClash(null);
              }}
              onSetQuantity={(quantity) => {
                edit(clashing.id, { quantity });
                setClash(null);
              }}
              onAddAnyway={() => {
                add(listId, clash.entry.name, clash.entry.quantity);
                setClash(null);
              }}
            />
          </div>
        ) : entry?.name ? (
          <div className="mb-1.5">
            <Preview entry={entry} />
          </div>
        ) : null}

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-(--ease-out) motion-reduce:transition-none",
            chipsVisible
              ? "mb-1.5 grid-rows-[1fr] opacity-100"
              : "pointer-events-none mb-0 grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden" inert={!chipsVisible}>
            <BuyAgainChips
              chips={chips}
              label={isTyping ? "Bought before" : "Buy again"}
              onPick={pickChip}
              onUndo={isTyping ? undefined : undoChip}
              className="px-1"
            />
          </div>
        </div>

        <DockForm
          onSubmit={submit}
          canSubmit={Boolean(entry?.name)}
          submitLabel={`Add to ${list.name}`}
        >
          <input
            ref={inputRef}
            aria-label={`Add to ${list.name}`}
            placeholder={`Add to ${list.name}, e.g. "2 milk"`}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setClash(null);
            }}
            maxLength={100}
            autoComplete="off"
            enterKeyHint="done"
            className={cn(FIELD, !isTyping && historyCount > 0 && "pr-1")}
          />
          {!isTyping && historyCount > 0 && (
            <button
              type="button"
              aria-label={dueCount > 0 ? `Buy again, ${dueCount} due` : "Buy again"}
              onMouseDown={keepFocus}
              onClick={openRestock}
              className="flex h-10 shrink-0 items-center gap-1 rounded-[14px] px-2.5 text-sm font-[750] text-area-fg outline-none transition-[background-color,scale] duration-150 ease-(--ease-out) hover:bg-area-tint/70 focus-visible:ring-3 focus-visible:ring-ring/80 active:scale-[0.94] motion-reduce:active:scale-100"
            >
              <ClockCounterClockwiseIcon aria-hidden weight="bold" className="size-[19px]" />
              {dueCount > 0 && (
                <span className="text-xs leading-none tabular-nums">{dueCount}</span>
              )}
            </button>
          )}
        </DockForm>
      </div>

      {/* Rendered outside the dock focus wrapper so portal focus never expands dock chips */}
      <BuyAgainSheet
        open={restockOpen}
        onOpenChange={setRestockOpen}
        listId={listId}
        listName={list.name}
        viewer={viewer}
      />
    </>
  );
}

/** For buttons beside the field: they don't take its focus, so the keyboard stays up */
function keepFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

const CARD =
  "mx-1 rounded-[18px] bg-card px-3.5 py-2.5 text-sm shadow-[0_1px_0_var(--dock-line)] transition-[opacity,translate] duration-200 ease-(--ease-out) starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none";

/** How what's typed will be read: "Adds Oat milk · 2 to Dairy & Eggs" */
function Preview({ entry }: { entry: Entry }) {
  return (
    <p
      aria-live="polite"
      className={cn(CARD, "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground")}
    >
      Adds <Tag>{entry.name}</Tag>
      {entry.quantity && (
        <>
          · <Tag>{entry.quantity}</Tag>
        </>
      )}
      to <Tag>{categorize(entry.name)}</Tag>
    </p>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <b className="rounded-md bg-muted px-1.5 py-0.5 font-[650] text-foreground">{children}</b>;
}

/**
 * The list has it already. Waiting: change its amount, or add it anyway. Ticked: put it back on
 * the list, or add a new row.
 */
function ClashCard({
  item,
  entry,
  viewerId,
  onUntick,
  onSetQuantity,
  onAddAnyway,
}: {
  item: ShoppingItem;
  entry: Entry;
  viewerId: string;
  onUntick: () => void;
  onSetQuantity: (quantity: string) => void;
  onAddAnyway: () => void;
}) {
  const nextQuantity = item.checked
    ? null
    : entry.quantity
      ? entry.quantity === item.quantity
        ? null
        : entry.quantity
      : stepQuantity(item.quantity ?? "", 1);
  const ticker = item.checkedBy
    ? item.checkedBy.id === viewerId
      ? "You"
      : firstName(item.checkedBy.name)
    : "Someone";

  return (
    <output className={cn(CARD, "block")}>
      <p className="flex items-start gap-2">
        <InfoIcon aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-area-fg" />
        <span className="min-w-0">
          <b className="font-[700]">{item.name} is already on the list</b>
          <span className="block text-[0.8125rem] text-muted-foreground">
            {item.checked
              ? `${ticker} ticked it. Untick it to get it again.`
              : item.quantity
                ? `Waiting, ${item.quantity}.`
                : "Still waiting to be bought."}
          </span>
        </span>
      </p>
      <div className="mt-2 flex gap-2">
        {item.checked ? (
          <Button size="sm" onMouseDown={keepFocus} onClick={onUntick} className="h-9 flex-1">
            Untick {item.name}
          </Button>
        ) : (
          nextQuantity && (
            <Button
              size="sm"
              onMouseDown={keepFocus}
              onClick={() => onSetQuantity(nextQuantity)}
              className="h-9 flex-1"
            >
              Make it {nextQuantity}
            </Button>
          )
        )}
        <Button
          size="sm"
          variant="secondary"
          onMouseDown={keepFocus}
          onClick={onAddAnyway}
          className="h-9 flex-1"
        >
          Add a new row
        </Button>
      </div>
    </output>
  );
}
