// Shapes the todos feature returns to clients

export type Todo = {
  id: string;
  name: string;
  notes: string | null;
  /** Serialized as "YYYY-MM-DD" */
  dueOn: Temporal.PlainDate | null;
  done: boolean;
  doneAt: Temporal.Instant | null;
  createdAt: Temporal.Instant;
};
