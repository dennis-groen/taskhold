# Deleting chores waits for the Undo window

Deleting a chore, and Clear done on chores, take the chores off the screen straight away but only send the delete once the Undo toast closes; Undo just cancels it. Clear done deletes the chores it showed one by one, so one a housemate marks done meanwhile isn't swept up without an Undo of its own. To-dos and shopping items are deleted at once and Undo creates them again with the same id, but a chore's history is deleted with it, so the same trick would bring a repeating chore back with no record of who did it or when.

## Considered options

- **Create it again** (as to-dos and shopping items do): small, but Undo would quietly wipe the history.
- **Keep deleted chores on the server for a while** and restore them: the sturdiest, but needs a migration and every chore query to skip deleted rows.

## Consequences

If the app is closed inside the Undo window, the delete is never sent and the chore comes back; deleting it again fixes that. Housemates keep seeing the chore for those few seconds.
