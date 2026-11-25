// The feature's contract: the shapes returned to clients

/** What the app needs to know about the demo, on GET /api/viewer */
export type DemoStatus = {
  /** Whether this server offers the demo at all */
  available: boolean;
  /** When the visitor's demo is deleted; null when they aren't in one */
  endsAt: Temporal.Instant | null;
};

/** What a housemate just did when asked to (POST /api/demo/housemate) */
export type HousemateAction = {
  housemate: string;
  action: "ticked" | "added";
  item: string;
};
