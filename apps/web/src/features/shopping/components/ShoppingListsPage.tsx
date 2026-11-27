import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { CaretRightIcon, PlusIcon } from "@/components/icons.ts";
import { AreaHeader, Count, Meter } from "@/components/layout/AreaHeader.tsx";
import { SharedWithLine } from "@/components/SharedWithLine.tsx";
import { Button } from "@/components/ui/button";
import { offerUndo } from "@/lib/feedback.ts";
import type { Housemate } from "@/lib/shared-with.ts";
import { cn } from "cn";

import type { ShoppingListSummary } from "../shopping.api.ts";
import {
  useAddItem,
  useBuyAgain,
  useBuyAgainHistoryCount,
  useBuyAgainState,
  useManageLists,
  useUndoAddItem,
} from "../shopping.hooks.ts";
import { listsQuery } from "../shopping.queries.ts";
import { BuyAgainChips } from "./BuyAgainChips.tsx";
import { BuyAgainSheet } from "./BuyAgainSheet.tsx";
import { ListMenu } from "./ListMenu.tsx";
import { ListPicker } from "./ListPicker.tsx";

const householdRoute = getRouteApi("/_household");

/** Lists most households keep, offered while there are none yet */
const STARTERS = [
  { name: "Groceries", hint: "The weekly shop" },
  { name: "Hardware store", hint: "Screws, bulbs, batteries" },
  { name: "Pharmacy", hint: "Plasters, paracetamol" },
  { name: "Market", hint: "Fruit, veg, flowers" },
  { name: "Corner shop", hint: "When something runs out" },
  { name: "Party", hint: "For the next birthday" },
];

/** "4 ticked of 11 items", with the numbers in bold */
function Progress({ itemCount, openCount }: { itemCount: number; openCount: number }) {
  if (itemCount === 0) return <>No items yet</>;
  if (openCount === 0) return <>All in the basket</>;
  const ticked = itemCount - openCount;
  const items = (
    <>
      <b className="font-[750] text-foreground">{itemCount}</b> {itemCount === 1 ? "item" : "items"}
    </>
  );
  return ticked === 0 ? (
    <>None ticked of {items}</>
  ) : (
    <>
      <b className="font-[750] text-foreground">{ticked}</b> ticked of {items}
    </>
  );
}

/** All of the household's shopping lists, and the regulars to put back on one */
export function ShoppingListsPage({ otherMembers }: { otherMembers: Housemate[] }) {
  const { data: lists } = useSuspenseQuery(listsQuery());
  const toGet = lists.reduce((sum, list) => sum + list.openCount, 0);

  return (
    <>
      <AreaHeader
        title="Shopping"
        right={<SharedWithLine otherMembers={otherMembers} onSlab />}
        meta={
          lists.length === 0 ? (
            <>
              <Count value={0}>lists</Count>
              <span>Nothing to get yet</span>
            </>
          ) : (
            <>
              <Count value={lists.length}>{lists.length === 1 ? "list" : "lists"}</Count>
              <Count value={toGet}>to get</Count>
            </>
          )
        }
      />

      {lists.length === 0 ? (
        <Starters />
      ) : (
        <>
          <ul className="mt-2 -mx-4 sm:-mx-6 lg:mx-0">
            {lists.map((list, index) => (
              <ListRow key={list.id} list={list} first={index === 0} />
            ))}
          </ul>
          <BuyAgainSection lists={lists} />
        </>
      )}
    </>
  );
}

/**
 * A list: its name and progress open it, the big number says what's left, and the ⋯ beside it
 * renames or deletes it.
 */
function ListRow({ list, first }: { list: ShoppingListSummary; first: boolean }) {
  const empty = list.itemCount === 0;
  return (
    <li className="relative flex items-start gap-1 pr-2 lg:pr-0">
      {!first && <span aria-hidden className="absolute inset-x-0 top-0 ml-5 h-px bg-border" />}
      <Link
        to="/lists/$listId"
        params={{ listId: list.id }}
        className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-3 py-3.5 pl-5 outline-none transition-colors duration-150 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70 lg:rounded-2xl"
      >
        <span className="min-w-0">
          <span className="block truncate text-xl font-bold tracking-[-0.01em]">{list.name}</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            <Progress {...list} />
          </span>
        </span>
        <span className="text-right leading-none">
          <b
            className={cn(
              "text-count block text-[2.125rem]",
              list.openCount > 0 ? "text-area-fg" : "text-muted-foreground",
            )}
          >
            {list.openCount}
          </b>
          <span className="text-xs font-[650] text-muted-foreground">to get</span>
        </span>
        {empty ? (
          <span
            aria-hidden
            className="col-span-2 mt-3 h-[5px] rounded-[2px] border border-dashed border-line-strong/60"
          />
        ) : (
          <Meter
            thin
            done={list.itemCount - list.openCount}
            total={list.itemCount}
            className="col-span-2 mt-3 text-area-fg [&_i:not(.bg-current)]:bg-border"
          />
        )}
      </Link>
      <ListMenu
        list={{ id: list.id, name: list.name, itemCount: list.itemCount }}
        className="mt-4"
      />
    </li>
  );
}

/**
 * "Buy again" on the overview: the household's regulars as chips, put back on the list chosen
 * above them with one tap.
 */
function BuyAgainSection({ lists }: { lists: ShoppingListSummary[] }) {
  const { user } = householdRoute.useRouteContext();
  const add = useAddItem(user);
  const undoAdd = useUndoAddItem();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [restockOpen, setRestockOpen] = useState(false);
  const target = lists.find((list) => list.id === pickedId) ?? lists[0];
  const historyCount = useBuyAgainHistoryCount();
  const { pinnedIds, addedIdFor, markAdded, clearAdded } = useBuyAgainState(target?.id);
  const suggestions = useBuyAgain(target?.id, "", pinnedIds);

  if (!target || historyCount === 0) return null;

  const chips = suggestions.map(({ name, quantity }) => ({
    name,
    quantity,
    added: addedIdFor(name) !== undefined,
  }));

  return (
    <section aria-labelledby="buy-again-heading" className="mt-8">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <h2 id="buy-again-heading" className="text-sm font-[750]">
            Buy again
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRestockOpen(true)}
            className="h-9 gap-0.5 rounded-full px-2.5 text-xs font-[700] text-area-fg after:-inset-y-1"
          >
            <span>See all</span>
            <CaretRightIcon aria-hidden weight="bold" className="size-3" />
          </Button>
        </div>
        <ListPicker lists={lists} value={target.id} onChange={setPickedId} />
      </div>
      {chips.length > 0 ? (
        <BuyAgainChips
          chips={chips}
          onPick={(name) => {
            const quantity = suggestions.find((item) => item.name === name)?.quantity ?? null;
            const id = add(target.id, name, quantity);
            markAdded(name, id);
          }}
          onUndo={(name) => {
            const id = addedIdFor(name);
            clearAdded(name);
            if (id) undoAdd(target.id, id);
          }}
          className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing due for {target.name} right now.{" "}
          <button
            type="button"
            onClick={() => setRestockOpen(true)}
            className="font-semibold text-area-fg underline-offset-4 hover:underline"
          >
            Browse past buys
          </button>
        </p>
      )}
      <BuyAgainSheet
        open={restockOpen}
        onOpenChange={setRestockOpen}
        listId={target.id}
        listName={target.name}
        viewer={user}
        onSessionClose={(addedIds) => {
          offerUndo(`Added ${addedIds.length} to ${target.name}`, () => {
            for (const id of addedIds) undoAdd(target.id, id);
          });
        }}
      />
    </section>
  );
}

/** No lists yet: one tap starts a common one and opens it */
function Starters() {
  const navigate = useNavigate();
  const { create } = useManageLists();

  return (
    <section aria-labelledby="starters-heading" className="mt-6">
      <h2 id="starters-heading" className="text-[1.375rem] font-[800] tracking-[-0.01em]">
        Start your first list
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick one to begin, or type a name in the field below.
      </p>
      <ul className="mt-3 -mx-4 sm:-mx-6 lg:mx-0">
        {STARTERS.map((starter, index) => (
          <li key={starter.name} className="relative">
            {index > 0 && (
              <span aria-hidden className="absolute inset-x-0 top-0 ml-5 h-px bg-border" />
            )}
            <button
              type="button"
              onClick={() => {
                const listId = create(starter.name);
                void navigate({ to: "/lists/$listId", params: { listId } });
              }}
              className="group/starter flex w-full items-center gap-3 py-3 pr-4 pl-5 text-left outline-none transition-colors duration-150 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-inset active:bg-muted/70 lg:rounded-2xl"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.0625rem] font-bold">{starter.name}</span>
                <span className="block text-sm text-muted-foreground">{starter.hint}</span>
              </span>
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-area-tint text-area-fg transition-transform duration-150 ease-(--ease-out) group-active/starter:scale-[0.92] motion-reduce:group-active/starter:scale-100"
              >
                <PlusIcon weight="bold" className="size-5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
