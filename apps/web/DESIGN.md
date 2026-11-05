# Design

taskhold is warm and homey: linen neutrals, a basil-green accent, friendly type, soft depth. Calm everywhere except what's overdue. shadcn (base-nova, Base UI) stays the component layer. New looks come from tokens in `src/styles/globals.css` and new variants on the shadcn components, not from replacing them.

## Color (`src/styles/globals.css`)

The strategy is restrained: warm neutrals and one accent. The accent is only for actions, the current tab, selection and ticked-off state.

| Token                            | Light                            | Dark                                   | Use                                                      |
| -------------------------------- | -------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `--canvas` / `--background`      | linen `oklch(0.968 0.007 78)`    | warm charcoal `oklch(0.195 0.008 65)`  | page ground                                              |
| `--card`                         | warm white                       | one step lighter than the canvas       | cards, sheets                                            |
| `--foreground`                   | espresso `oklch(0.255 0.014 55)` | warm off-white                         | text (never pure black or white)                         |
| `--muted-foreground`             | `oklch(0.495 0.017 60)`          | `oklch(0.73 0.014 75)`                 | secondary text, AA on canvas and card                    |
| `--primary`                      | basil `oklch(0.5 0.095 152)`     | `oklch(0.77 0.115 150)` with dark text | main actions, ticks                                      |
| `--primary-soft` / `-foreground` | sage tint / deep green           | deep green / light sage                | selected chips, active tab pill, soft buttons, + circles |
| `--destructive`                  | brick `oklch(0.54 0.175 32)`     | `oklch(0.72 0.15 30)`                  | overdue, delete                                          |
| `--sidebar`                      | one step deeper than the canvas  | darker than the canvas                 | the wide-screen rail                                     |
| `--tone-1..6` (+ `-fg`)          | pastel / deep pairs              | deep / pastel pairs                    | people's initials, picked from their name                |

Browser surfaces are themed too: `::selection`, `caret-color`, `scrollbar-color`, and the tap highlight is off.

## Type

- **Figtree Variable** (`font-sans`) for all of the interface.
- **Bricolage Grotesque Variable** with optical sizes (`font-heading`), only for page titles (`text-title` utility: 2rem / 1.08, weight 680, -0.028em), sheet and dialog titles, and the wordmark.
- Fixed rem scale: title 2rem; group heading 0.9375rem semibold; rows 1rem; secondary 0.8125–0.875rem. Numbers in lists use `tabular-nums`.

## Shape and depth

- `--radius: 0.75rem`. Cards are `rounded-xl` (about 17px), buttons `rounded-lg`, the main action in a sheet `rounded-xl`, chips and the + button fully round, sheets `rounded-t-[1.75rem]`, dialogs `rounded-2xl`.
- Shadows are warm, offset and soft: `shadow-card` (cards: a hairline plus a soft drop), `shadow-raised` (sheets, dialogs, toasts), `shadow-fab` (the + button). Cards don't use borders.

## Components

- `Button` variants: `default`, `soft`, `outline`, `secondary`, `ghost`, `destructive`, `link`, plus **`chip`** (rounded toggle, 44px tall; selected with `aria-pressed`, which adds a faint primary edge), **`fab`** (the round + button) and **`destructive-ghost`** (quiet red text for taking something away: Delete list and Delete account open a confirmation, Remove from list offers Undo). Sizes: `sm` 32px (with an invisible hit area to 44px), `default` 40px, `lg` 44px, `xl` 48px (a sheet's main action), `icon*` (`icon-xl` 48px sits beside a sheet's fields, e.g. the − and + by a quantity), `fab` 56px. Use the size scale rather than `h-*` overrides.
- `Checkbox variant="tick"`: the 24px round circle on every list row, its edge at least 3:1 against the card, with a 48px hit area. Its check mark pops in (`check-pop`).
- Focus: rings are `ring-ring/80` (3:1 or better in both themes). Tappable rows that run edge to edge use an inset ring (`focus-visible:ring-2 ring-inset`) plus their tint, never the tint alone.
- `ConnectionStatus` (`components/ConnectionStatus.tsx`): a dark pill at the top while offline, counting changes that are waiting to send.
- `SharedWithLine`: the housemates' faces (same tones as the initials on rows) and "Shared with Sam", under the title of shared pages.
- `tick-label` utility: put it on the inline text of a row, with `data-done` when done, and the strike-through draws across the words.
- `Group` / `GroupHeading` (`components/layout/Group.tsx`): a card of rows and the heading above it.
- `EmptyState` (`components/layout/EmptyState.tsx`): a duotone icon in a soft circle above the existing copy.
- `Wordmark` (`components/wordmark.tsx`): the house-and-tick mark plus "taskhold".
- `PageSkeleton`: the router's pending component.
- Nav (`components/layout/HouseholdShell.tsx`): a frosted bottom bar on phones and a rail on wide screens. The current tab's icon sits in a `primary-soft` pill.
- Shopping categories each have a Phosphor duotone icon (`features/shopping/category-icons.ts`).
- `BuyAgain` (`features/shopping/components/BuyAgain.tsx`): past buys as a sideways-scrolling row of `chip` buttons, each with its aisle's icon, under a small "Buy again" label. The row fades out at its edges. A tap adds without taking focus from the field above. In the quick-add sheet the list picker below it is labelled "Add to" in the same style, so the two rows of chips stay distinct. On a list it sits inside the Add item row and shares its tint while adding.

## Icons

Phosphor only, imported from `components/icons.ts` (lint blocks direct imports outside `components/ui`). Add a new icon there first. `regular` by default, `bold` for small glyphs (carets, plus, repeat), `duotone` for illustrative spots (empty states, categories), and `fill` for the current tab.

## Motion

- 150–250ms, `ease-out` or `--ease-out-quint`. Motion only shows a change of state.
- The one signature moment is ticking something off: the check pops in, then the line draws through the words. The row then holds in place for 2.5s (`lib/use-settling-items.ts`) on Shopping, Chores and Personal alike, so a slip can be untapped where it is, before it folds away to the cart, Done or its next due date.
- A shopping item that was just added lights up once (`row-fresh`), and a line under the add field says which aisle it went to.
- Smaller touches: buttons scale to 0.97 when pressed, carets nudge on hover, the + in an add row turns a quarter on focus, and sheets slide in with Base UI's own curve.
- Everything respects `prefers-reduced-motion`: fades stay so state changes remain visible, but nothing slides, scales or spins, and sheets fade instead of sliding (a rule at the end of `globals.css`).

## Touch and mobile

- Hover styles are mouse-only (Tailwind v4's `hover:` checks `(hover: hover)`), so every tappable row also has an `active:` background, and buttons scale on press.
- Inputs are at least 16px on phones (`text-base md:text-sm`), so iOS doesn't zoom in on focus.
- Controls get `touch-action: manipulation`; buttons, checkboxes, switches and nav links can't be text-selected by a long press. Content text stays selectable.
- `overscroll-behavior: none` on the page; sheets keep their own bounce.
- Appearance is Light, Dark or Auto (follow the device, the default). The status bar color (`theme-color`) follows what's on screen (`components/ThemeProvider.tsx`).
- The viewport uses `interactive-widget=resizes-content`, so the on-screen keyboard shrinks the layout instead of covering a sheet's main button.
- A tab stays lit on pages that belong to it (`alsoOn` in the nav, e.g. Invite under Household).
