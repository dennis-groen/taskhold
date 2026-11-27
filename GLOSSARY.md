# taskhold

A phone-first app for people who share a household: shared shopping lists, chores with reminders, and private to-dos.

## Language

**Area**:
A part of the app whose data is fetched, refreshed and kept on the device as a whole: shopping, chores or to-dos.
_Avoid_: topic, section, module

**Change**:
Something a person does to the data in an area (ticking an item, adding a chore, marking a chore done, skipping it) that shows straight away and reaches the server once there's a connection, even if the app is closed in between.
_Avoid_: mutation, action, optimistic update

**Undo**:
Taking back a change you just made, offered for a few seconds after it. Whatever comes back returns exactly as it was, history included.
_Avoid_: revert, restore, cancel

**Member**:
Someone in a household. Only its members see or change its shopping lists and chores, and someone stops being one the moment they leave or are removed.
_Avoid_: user, housemate

**Demo**:
A household a visitor gets without signing in, with made-up housemates, deleted after a day. Sealed: nobody joins it and its visitor can't leave it.
_Avoid_: sandbox, guest mode

### Shopping

**Item**:
One thing to buy on a shopping list, with an amount if someone gave one. It's always either waiting or ticked.
_Avoid_: row, product

**Waiting**:
An item still to be bought.
_Avoid_: open, unchecked, pending

**Ticked**:
An item someone has put in the basket. The list remembers who ticked it.
_Avoid_: checked, bought, done

**Buy again**:
What the household has bought before, offered for putting back on a list.
_Avoid_: restock, history, suggestions

**Running low**:
A Buy again item whose usual gap between buys has passed, so it's probably needed again.
_Avoid_: due (that's a chore's word)

### Chores

**Chore**:
Work a household shares, done once or again and again on a repeat rule.
_Avoid_: task

**Repeat rule**:
How often a repeating chore comes back: every so many days or weeks, counted from the day it was last done.
_Avoid_: interval, recurrence, schedule

**Due date**:
The calendar day a chore should be done by. A repeating chore always has one; a one-off chore may not.

**Mark done**:
Recording that someone did a chore today. A repeating chore's due date moves one repeat on from today; a one-off chore is done for good.
_Avoid_: complete, tick off

**Skip**:
Letting a repeating chore pass this time: its due date moves one repeat on, the skip goes in its history, and nobody is credited with doing it.
_Avoid_: completion

**Put off**:
Moving a due chore to tomorrow. Only the due date changes; nothing goes in its history.
_Avoid_: postpone, snooze

**History**:
The times a chore was marked done or skipped, newest first. Undo takes back the newest. A chore that stops repeating starts over with an empty history.
_Avoid_: completions
