// Shapes the chores feature returns to clients
import type { RepeatUnit } from "./chores.schema.ts";

export type Repeat = { every: number; unit: RepeatUnit };

export type ChoreCompletion = {
  id: string;
  /** Null when the person who did it has deleted their account */
  completedBy: { id: string; name: string } | null;
  /** The date it was done, where the person was */
  completedOn: string;
  createdAt: Date;
};

export type Chore = {
  id: string;
  name: string;
  /** Null for a one-off chore */
  repeat: Repeat | null;
  /** "YYYY-MM-DD". Always set for a repeating chore; a one-off one may have none. */
  dueOn: string | null;
  /** Null when nobody is assigned, or the assignee has left the household */
  assignee: { id: string; name: string; image: string | null } | null;
  lastCompletion: ChoreCompletion | null;
  /** A one-off chore that's been done. Repeating chores are never done, just due again later. */
  done: boolean;
};

export type ChoreDetail = Chore & {
  /** The most recent completions, newest first */
  history: ChoreCompletion[];
};
