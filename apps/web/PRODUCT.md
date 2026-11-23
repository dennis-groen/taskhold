# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (installable PWA, phone-first, also used on desktop)

## Users

People who live together (partners, families, housemates) sharing one household. Typical scene: one hand on a phone in a supermarket aisle ticking items off, or at home in the evening adding chores and to-dos. Sessions are short and frequent.

## Product Purpose

taskhold keeps a household's shared shopping lists, chores and private to-dos in one place, live for everyone in the household. Success is that nobody buys the same thing twice, chores get done without nagging, and the app stays out of the way.

## Positioning

One calm, shared home base: lists sort themselves by supermarket aisle, chores repeat and get assigned, and every change shows up live on housemates' phones.

## Operating Context

- Shopping: lists with items sorted into supermarket categories, ticked into a cart, cleared with "Done shopping". Quick add from the bottom dock (inline item/list input in Shopping, add sheet on Chores and Personal), plus Buy again chips and a restock sheet.
- Chores: due dates, repeats, assignees, filters (All / Mine / Anyone), reminders via Web Push.
- Personal: private to-dos only the person sees.
- Household: members, invite code / link, account, reminders, appearance (light / dark / auto), left-handed layout.
- Sign-in is Google only. Onboarding creates or joins a household.

## Capabilities and Constraints

- React + TanStack Router/Query, Tailwind v4, shadcn (base-nova, Base UI primitives), Phosphor icons.
- Binding (user, 2026-11-04): shadcn stays the component layer. Extend it with new variants and tokens rather than replacing components.
- Content Security Policy in builds: no inline styles injected by libraries, fonts self-hosted.
- Light and dark themes, both first-class.

## Brand Commitments

- Name is written lowercase: "taskhold".
- Voice: plain, friendly, short sentences ("Nothing to buy. Add the first item.").
- Mood chosen by the user: warm and homey, easy on the eyes.

## Product Principles

1. The task comes first: ticking, adding and checking what's due should take one tap.
2. Calm over loud: nothing shouts unless it's overdue.
3. Shared, but personal: show who did what without noise about yourself.
4. Works one-handed on a phone.

## Accessibility & Inclusion

WCAG AA contrast in both themes, 44px touch targets, reduced-motion respected, screen-reader labels on every control (already in place; keep them).
