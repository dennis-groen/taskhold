// The one list of what a live update can be about. The web app bundles this file
// (@taskhold/api/live-topics) and builds its own lists from it, so adding a topic here shows up
// there as type errors until the app handles it.

/** The parts of the app a change can be in, which apps refetch as a whole */
export const TOPICS = ["shopping", "chores", "todos", "household"] as const;

export type Topic = (typeof TOPICS)[number];
