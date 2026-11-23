import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { DrawerClose } from "@/components/ui/drawer";
import { cn } from "cn";

import type { UndoBar } from "../buy-again-sheet.hooks.ts";

/**
 * Bottom controls of the Buy again sheet: the transient "Added x · Undo" bar after quick-adding
 * something new from the filter, and the folding "Done" footer showing how many items are on the
 * list.
 */
export function BuyAgainFooter({
  undoBar,
  lastUndoBar,
  undoBarRef,
  showFooter,
  openCount,
  listName,
  ready,
}: {
  undoBar: UndoBar | null;
  lastUndoBar: UndoBar | null;
  undoBarRef: RefObject<HTMLDivElement | null>;
  showFooter: boolean;
  openCount: number;
  listName: string;
  ready: boolean;
}) {
  return (
    <>
      {/* "Added x · Undo" after adding something new from the filter; folds in and out */}
      <div
        className={cn(
          "grid shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) motion-reduce:transition-none",
          undoBar ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div ref={undoBarRef} className="min-h-0 overflow-hidden" inert={!undoBar}>
          {lastUndoBar && (
            <div className="mx-4 mb-2 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[var(--toast-bg)] pr-2 pl-4 text-sm font-medium text-[var(--toast-fg)] shadow-raised">
              <span className="min-w-0 truncate">{lastUndoBar.message}</span>
              <button
                type="button"
                onClick={lastUndoBar.undo}
                className="h-10 shrink-0 rounded-xl px-3 text-sm font-[750] text-[var(--toast-act)] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring/80 active:scale-[0.95] motion-reduce:active:scale-100"
              >
                Undo
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) motion-reduce:transition-none",
          showFooter
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!showFooter}>
          <div className="border-t border-border bg-canvas px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <DrawerClose
              render={
                // A word space between "3" and "on Groceries", not the button's icon gap
                <Button size="xl" className="w-full min-w-0 max-w-full gap-[0.28em] tabular-nums">
                  {openCount > 0 ? (
                    <>
                      <span className="shrink-0">
                        Done ·{" "}
                        <span
                          key={openCount}
                          className={cn(
                            ready &&
                              "transition-opacity duration-150 ease-(--ease-out) starting:opacity-60 motion-reduce:transition-none",
                          )}
                        >
                          {openCount}
                        </span>
                      </span>
                      <span className="min-w-0 truncate">on {listName}</span>
                    </>
                  ) : (
                    "Done"
                  )}
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
