import { index, pgTable, text } from "drizzle-orm/pg-core";

import { instant, now, plainDate } from "../../db/columns.ts";
import { user } from "../auth/auth.schema.ts";

// Private to-dos belong to a person, not a household: only they can see them, and they keep them
// when they leave or switch households
export const todo = pgTable(
  "todo",
  {
    // Clients may pick the id, so a to-do added optimistically keeps it once saved
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    dueOn: plainDate("due_on"),
    // Null while it still needs doing
    doneAt: instant("done_at"),
    createdAt: instant("created_at").default(now).notNull(),
    updatedAt: instant("updated_at")
      .default(now)
      .$onUpdate(() => Temporal.Now.instant())
      .notNull(),
  },
  (table) => [index("todo_userId_idx").on(table.userId)],
);
