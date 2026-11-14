# taskhold

A phone-first app for people who share a household: shared shopping lists, chores with reminders, and private to-dos.

## Language

**Area**:
A part of the app whose data is fetched, refreshed and kept on the device as a whole: shopping, chores or to-dos.
_Avoid_: topic, section, module

**Change**:
Something a person does to the data in an area (ticking an item, marking a chore done, skipping it) that shows straight away and reaches the server once there's a connection, even if the app is closed in between.
_Avoid_: mutation, action, optimistic update

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
