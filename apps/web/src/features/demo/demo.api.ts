import { api, parseResponse, type InferResponseType } from "@/lib/api.ts";

/** What a housemate did when the visitor asked them to */
export type HousemateAction = InferResponseType<typeof api.demo.housemate.$post, 200>;

/** Signs the visitor in to a demo household of their own; the API sets the session cookie */
export async function startDemo(): Promise<void> {
  await parseResponse(api.demo.$post());
}

/** Deletes the visitor's demo and signs them out */
export async function endDemo(): Promise<void> {
  await parseResponse(api.demo.$delete());
}

/** A housemate ticks something off (or adds something) on the shopping list */
export async function askHousemate(): Promise<HousemateAction> {
  return parseResponse(api.demo.housemate.$post());
}
