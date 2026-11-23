import type { FormEvent, KeyboardEvent, RefObject } from "react";

import { MagnifyingGlassIcon, XIcon } from "@/components/icons.ts";
import { Button } from "@/components/ui/button";

/**
 * Filter input and list-scope chips at the top of the Buy again sheet. Pressing Enter submits the
 * highlighted match or quick-add card; Escape clears a non-empty filter before closing the sheet.
 */
export function BuyAgainSearchBar({
  searchRef,
  query,
  trimmedQuery,
  typingHint,
  listName,
  hasOtherLists,
  includeOtherLists,
  onQueryChange,
  onClearQuery,
  onSubmit,
  onFocus,
  onBlur,
  onSelectScope,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  trimmedQuery: string;
  typingHint: string | null;
  listName: string;
  hasOtherLists: boolean;
  includeOtherLists: boolean;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSelectScope: (includeOtherLists: boolean) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.stopPropagation();
      onClearQuery();
    }
  }

  return (
    <div className="relative z-20 shrink-0 px-4 pt-1 pb-2">
      <form onSubmit={onSubmit} className="relative">
        <MagnifyingGlassIcon
          aria-hidden
          weight="bold"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={searchRef}
          type="search"
          aria-label="Filter past buys"
          placeholder="Filter past buys"
          value={query}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
          enterKeyHint="go"
          className="h-11 w-full rounded-2xl bg-card pr-11 pl-10 text-base font-medium shadow-card outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-area/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear filter"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClearQuery}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-transform duration-150 ease-(--ease-out) hover:bg-muted hover:text-foreground active:scale-[0.92] motion-reduce:active:scale-100"
          >
            <XIcon aria-hidden weight="bold" className="size-4" />
          </button>
        )}
        {typingHint && (
          // The live region already says this; this is the visible version. It sits inside the
          // field, next to what was typed, so it covers no results and never shifts the layout
          <p
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-11 max-w-[60%] -translate-y-1/2 truncate rounded-full bg-area-tint px-2.5 py-1 text-xs font-semibold text-area-fg transition-[opacity,translate] duration-150 ease-(--ease-out) starting:translate-x-1 starting:opacity-0 motion-reduce:transition-none"
          >
            {typingHint}
          </p>
        )}
      </form>

      {hasOtherLists && (
        <div className="mt-2.5 flex min-h-11 items-center">
          {trimmedQuery ? (
            <p className="px-1 text-[0.8125rem] font-medium text-muted-foreground">
              Searching all lists
            </p>
          ) : (
            <fieldset className="flex min-w-0 flex-1 gap-2">
              <legend className="sr-only">Which past buys to show</legend>
              <Button
                type="button"
                variant="chip"
                aria-pressed={!includeOtherLists}
                onClick={() => onSelectScope(false)}
                className="max-w-[55%] aria-pressed:font-medium"
              >
                <span className="truncate">{listName}</span>
              </Button>
              <Button
                type="button"
                variant="chip"
                aria-pressed={includeOtherLists}
                onClick={() => onSelectScope(true)}
                className="aria-pressed:font-medium"
              >
                All lists
              </Button>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
