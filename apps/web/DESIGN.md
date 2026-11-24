# Design

taskhold is warm and homey: warm neutrals, one colour per area, crisp wide display type, soft hairlines. Calm everywhere except what's overdue. shadcn (base-nova, Base UI) stays the component layer. New looks come from tokens in `src/styles/globals.css` and new variants on the shadcn components, not from replacing them.

## Color (`src/styles/globals.css`)

The strategy is warm neutrals plus one colour per area: **basil** for Shopping, **cobalt** for Chores, **yolk** for Household, and **graphite** for private To-dos (colour means shared; graphite means only you). `HouseholdShell` sets `data-area` (`shop`, `chores`, `todos`, `home`) on `<html>`, and `--primary`, `--primary-soft`, `--accent`, `--ring` and `--sidebar-*` all point at the active area's `--area-*` tokens so every button, tick and sheet follows the area, portals included.

| Token                                       | Light                                                | Dark                              | Use                                                          |
| ------------------------------------------- | ---------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `--canvas` / `--background`                 | `#f6f5f2`                                            | `#0d0e10`                         | page ground                                                  |
| `--card`                                    | `#ffffff`                                            | `#17191c`                         | cards, category sections                                     |
| `--popover` (`--color-sheet`)               | `#ffffff`                                            | `#1a1c20`                         | sheets, dialogs, menus                                       |
| `--foreground`                              | `#18191c`                                            | `#f2f2f0`                         | text (never pure black or white)                             |
| `--muted` / `--secondary`                   | `#ecebe5`                                            | `#24262b`                         | quiet fills, secondary buttons                               |
| `--muted-foreground`                        | `#5c5e64`                                            | `#a3a6ad`                         | secondary text, AA on canvas and card                        |
| `--border`                                  | `#e2e0da`                                            | `#26282d`                         | row hairlines, card outlines                                 |
| `--line-strong` / `--input`                 | `#8a8984`                                            | `#71747b`                         | unticked rings and field outlines (3:1 against canvas)       |
| `--destructive`                             | `#c42b1f`                                            | `#ff7b6e`                         | overdue, delete                                              |
| `--warn` / `--warn-tint`                    | `#7f5c00` / `#fbf2dc`                                | `#f0c454` / `#241e10`             | warnings, soft caution fills                                 |
| `--shop-*` (`data-area="shop"`)             | slab/btn `#0b7f4b`, tint `#e2f0e7`                   | slab `#1f5c41`, fg/tab `#4fd18e`  | Shopping                                                     |
| `--cho-*` (`data-area="chores"`)            | slab/btn `#2f4cf2`, tint `#e7eafd`                   | slab `#3a4cb0`, fg/tab `#93a3ff`  | Chores                                                       |
| `--todo-*` (`data-area="todos"`)            | slab `#1e2024`, tint `#e9e8e4`                       | slab `#303237`, fg/tab `#f2f2f0`  | Private to-dos                                               |
| `--home-*` (`data-area="home"`)             | slab/tab `#ffc21a`, fg `#7f5c00`                     | slab `#d49a1e`, fg/tab `#f0c454`  | Household                                                    |
| `--dock-bg` / `--dock-field`                | frosted `#fbfaf7`/84%, `#ecebe5`                     | frosted `#1c1e22`/90%, `#2a2c32`  | bottom dock and its add input                                |
| `--toast-bg` / `--toast-fg` / `--toast-act` | `#1e2024` / `#f2f2f0` / `#a9b6ff`                    | `#2a2c32` / `#f2f2f0` / `#a9b6ff` | toasts (dark slip above the dock in both themes)             |
| `--member-1..6` + `--member-ink`            | 6 pastel tones (OKLCH L 0.80) + `#18191c`            | same tones + `#18191c`            | housemates' initials and `MemberMark` (`[data-tone="1..6"]`) |
| `--status-bar`                              | `--area-slab` inside household, `--canvas` elsewhere | same                              | `meta[name="theme-color"]` synced via `lib/theme.ts`         |

In dark mode, area slabs drop about 30% chroma while brightness moves to text (`--area-fg`), ticks and active tab pills (`--area-tab`). Browser surfaces are themed too: `::selection`, `caret-color`, `scrollbar-color`, and the tap highlight is off.

## Type

- **Archivo Variable** (`@fontsource-variable/archivo/standard.css`, `font-sans`, with a metric-matched `"Archivo Fallback"` `@font-face`) carries the whole interface. `--font-heading` aliases `--font-sans`.
- Normal width for reading and rows; Archivo's wide cut (`font-stretch: 125%`) for titles and big counts:
  - `text-title` utility: `2.5rem` / line-height `1`, weight `820`, `font-stretch: 125%`, `-0.03em`.
  - `text-count` utility: weight `800`, `font-stretch: 125%`, `-0.03em`, `tabular-nums`.
  - `font-wide` utility: `font-stretch: 125%`, `-0.02em`.
  - `.font-heading` (sheet and dialog titles): `font-stretch: 118%`, `-0.025em`.
- Numbers in lists and badges use `tabular-nums`.

## Shape and depth

- `--radius: 0.875rem` (14px), scaled across `--radius-sm` (`0.6×`) through `--radius-4xl` (`2.6×`). Area header slabs are `rounded-b-[28px]` (`rounded-[28px]` on wide screens), compact headers `rounded-b-[22px]`, the dock `rounded-[1.75rem]`, dock fields `rounded-[22px]`, sheets `rounded-t-[1.75rem]`, dialogs `rounded-2xl`, chips fully round.
- Depth is restrained: `shadow-card` (a 1px `--border` hairline), `shadow-raised` (sheets, dialogs, offline pill), `shadow-fab`, and `--dock-shadow` with `backdrop-blur-[22px]` on the frosted dock.

## Components

- `Button` (`components/ui/button.tsx`): variants `default`, `soft`, `outline`, `secondary`, `ghost`, `destructive`, **`destructive-ghost`** (quiet red text for taking something away; a confirmation or Undo carries the weight), `link`, **`chip`** (44px rounded toggle; selected with `aria-pressed`), and **`fab`**. Sizes: `xs` 24px, `sm` 32px (with an invisible hit area to 44px), `default` 40px, `lg` 44px, `xl` 48px (a sheet's main action), `icon*` (`icon-xl` 48px sits beside a sheet's fields), `fab` 56px. Use the size scale rather than `h-*` overrides.
- `Checkbox` (`components/ui/checkbox.tsx`): `variant="tick"` (26px round ring in a 44px target for shared shopping items), `variant="done"` (44px ring with its check kept mounted for chores), and `variant="square"` (26px rounded box for private to-dos). All pop their check in (`check-pop`).
- Focus: rings are `ring-ring/80` (3:1 or better in both themes). Edge-to-edge tappable rows use an inset ring (`focus-visible:ring-2` or `ring-3` with `ring-inset`).
- `AreaHeader` / `CompactHeader` / `Segments` / `Count` / `Meter` (`components/layout/AreaHeader.tsx`): the coloured slab at the top of an overview page that runs under the status bar and folds into a fixed 52px bar once the title scrolls away; `CompactHeader` stays sticky on detail pages (an open shopping list).
- `HouseholdShell` (`components/layout/HouseholdShell.tsx`): on phones, a frosted floating dock at the bottom with the area's add control stacked over 4 tabs (Shopping, Chores, To-dos with a lock icon, Household), each active tab lit with an `area-tab` pill and optional overdue count badge. On wide screens (`lg:`), a 256px left sidebar holds the `Wordmark`, area links with counts, shopping lists, and viewer info, while the add dock floats at the foot of the main column.
- `JotButton` (`components/JotButton.tsx`): the dock trigger on Chores and To-dos that looks like an input field and opens the add sheet.
- `SheetContent` / `SheetHeader` / `SheetEyebrow` / `SHEET_BODY` (`components/layout/Sheet.tsx`): shared bottom-sheet layout with eyebrow label, close button and safe-area bottom padding.
- `Group` / `GroupHeading` (`components/layout/Group.tsx`): hairline-divided rows on the canvas running edge to edge on phones, and the heading above them.
- `SettingRow` / `SettingLink` / `SettingButton` (`components/layout/SettingRow.tsx`): settings rows inside a `Group`. `SettingRow` holds a control (a switch, a time); `SettingLink` opens a page of its own and shows the current value before its chevron ("Notifications On ›"); `SettingButton` does something, in `plain`, `accent` (the area's colour, for offers like Invite someone) or `danger` tone, and can be a `ConfirmDialog` trigger.
- Household page: a hub, not a long form. People (with Invite someone as the last row), then one `SettingLink` per kind of setting, the account, and Leave set apart at the foot. Each setting page (`routes/_household/household/*.tsx`) uses `SettingsPage` (`components/layout/SettingsPage.tsx`): the compact slab with the way back to Household, and `GroupNote` for a quiet line under a group. A new setting is a new row and page, never a new block on the hub. Settings rows start with a 40px slot (an icon or a face), so people rows and setting rows share one text column. Only danger groups (Leave, Delete account) get a hairline above and below, set apart with extra space, as a deliberate signal. Account actions (sign out, sign out of other devices, delete) live on Account, with Delete set apart at the foot.
- `EmptyState` (`components/layout/EmptyState.tsx`): a duotone icon in a `primary-soft` circle above the copy.
- `ConnectionStatus` (`components/ConnectionStatus.tsx`): a dark pill at the top while offline, counting changes waiting to sync and opening a sheet that lists them with a "Try now" action.
- `SharedWithLine` (`components/SharedWithLine.tsx`): overlapping `UserAvatar` faces in the housemates' tones (standalone on a slab with screen-reader text; paired with "Shared with Sam" elsewhere).
- `MemberMark` (`components/MemberMark.tsx`): a small dot in the housemate's `--member-*` tone tucked at the lower left of a tick, with a clock ring while unsynced.
- `LeftHandedRow` (`components/LeftHandedRow.tsx`): per-device toggle (`lib/tick-side.ts`) that sets `data-ticks="left"` so the `ticks-left:` variant moves row tick circles to the left thumb.
- `Wordmark` (`components/Wordmark.tsx`): the three-colour stacked house mark (`LogoMark`) plus lowercase "taskhold".
- `PageSkeleton` (`components/PageSkeleton.tsx`): the router's pending component.
- `tick-label` utility: put it on the inline text of a row, with `data-done` when done, and the strike-through draws across the words.
- Shopping categories each have a Phosphor duotone icon (`features/shopping/category-icons.ts`).
- `ShoppingItemRow` (`features/shopping/components/ShoppingItemRow.tsx`): tapping the item name or amount opens the edit sheet; the round tick sits on the right under the thumb (or left in left-handed mode). Ticked items show "You" or the housemate's first name beside the tick plus `MemberMark`; unticked items someone else added show "Added by Sam" under the name.
- `ShopDock`, `BuyAgainChips`, and `BuyAgainSheet` (`features/shopping/components/`): on a list, `ShopDock` provides quick add ("2 milk") with a live aisle preview card, duplicate clash card, an expandable sideways-scrolling row of toggleable `BuyAgainChips` while focused or typing, and a button to open the full `BuyAgainSheet` restock catalog.

## Icons

Phosphor only, imported from `components/icons.ts` (lint blocks direct imports outside `components/ui`). Add a new icon there first. `regular` by default, `bold` for small glyphs (carets, plus, repeat, locks), `duotone` for illustrative spots (empty states, categories), and `fill` for the active tab and active theme choice.

## Motion

- 150–300ms using `--ease-out`, `--ease-out-quint`, `--ease-drawer` (sheets), and `--ease-in-out` (layout moves like the left-handed preview). Motion only shows a change of state.
- The signature moment is ticking something off: the check pops in (`check-pop`), then the line draws through the words (`tick-label`). The row holds in place for 2.5s (`lib/use-settling-items.ts`) on Shopping, Chores and Personal alike, so a slip can be untapped where it is before it folds away to the cart, Done or its next due date.
- A shopping item that was just added lights up once (`row-fresh`), and `ShopDock` previews which aisle it will land in while typing.
- Everything respects `prefers-reduced-motion`: fades stay so state changes remain visible, but nothing slides, scales or spins, and sheets fade instead of sliding (unlayered rules at the end of `globals.css`).

## Touch and mobile

- Hover styles are mouse-only (Tailwind v4's `hover:` checks `(hover: hover)`), so tappable controls also have `active:` feedback and buttons scale slightly on press.
- Inputs are at least 16px on phones (`text-base md:text-sm` or `text-[1.0625rem]`), so iOS doesn't zoom in on focus.
- Controls get `touch-action: manipulation`; buttons, checkboxes, switches and nav links can't be text-selected by a long press. Content text stays selectable.
- `overscroll-behavior: none` on the page; sheets keep their own bounce (`overscroll-behavior: contain`).
- Appearance is Light, Dark or Auto (follow the device, the default, in `components/ThemeToggle.tsx` / `components/ThemeProvider.tsx`). The status bar color (`meta[name="theme-color"]`) follows `--status-bar` (`lib/theme.ts`).
- Left-handed layout (`lib/tick-side.ts`) flips row tick placement to the left edge on that device (`ticks-left:` variant).
- The viewport uses `viewport-fit=cover` and `interactive-widget=resizes-content`, so safe-area insets work and the on-screen keyboard shrinks the layout instead of covering a sheet's main button.
- A tab stays lit on pages that belong to it (`alsoOn` in `HouseholdShell.tsx`, e.g. `/invite` under Household).
