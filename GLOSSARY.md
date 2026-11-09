# taskhold

A phone-first app for people who share a household: shared shopping lists, chores with reminders, and private to-dos.

## Language

**Area**:
A part of the app whose data is fetched, refreshed and kept on the device as a whole: shopping, chores or to-dos.
_Avoid_: topic, section, module

**Change**:
Something a person does to the data in an area (ticking an item, marking a chore done, skipping it) that shows straight away and reaches the server once there's a connection, even if the app is closed in between.
_Avoid_: mutation, action, optimistic update
