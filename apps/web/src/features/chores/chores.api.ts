import { api, parseResponse, type InferResponseType } from "@/lib/api-client.ts";

const chores = api.chores;

export type Chore = InferResponseType<typeof chores.$get, 200>["chores"][number];
export type ChoreDetail = InferResponseType<(typeof chores)[":choreId"]["$get"], 200>["chore"];
export type Repeat = NonNullable<Chore["repeat"]>;

export type ChoreInput = {
  name: string;
  repeat: Repeat | null;
  dueOn: string | null;
  assigneeId: string | null;
};

export async function fetchChores(): Promise<Chore[]> {
  return (await parseResponse(chores.$get())).chores;
}

export async function fetchChore(choreId: string): Promise<ChoreDetail> {
  return (await parseResponse(chores[":choreId"].$get({ param: { choreId } }))).chore;
}

export async function createChore(input: ChoreInput): Promise<ChoreDetail> {
  return (await parseResponse(chores.$post({ json: input }))).chore;
}

export async function updateChore(
  choreId: string,
  changes: Partial<ChoreInput>,
): Promise<ChoreDetail> {
  return (await parseResponse(chores[":choreId"].$patch({ param: { choreId }, json: changes })))
    .chore;
}

export async function deleteChore(choreId: string): Promise<void> {
  await parseResponse(chores[":choreId"].$delete({ param: { choreId } }));
}

/** Marks the chore done today, `today` being the date on this device */
export async function completeChore(choreId: string, today: string): Promise<ChoreDetail> {
  return (
    await parseResponse(chores[":choreId"].complete.$post({ param: { choreId }, json: { today } }))
  ).chore;
}

/** Takes back the chore's most recent completion */
export async function undoCompletion(choreId: string): Promise<ChoreDetail> {
  return (await parseResponse(chores[":choreId"].undo.$post({ param: { choreId } }))).chore;
}

/** Removes one-off chores that are done */
export async function clearDoneChores(): Promise<number> {
  return (await parseResponse(chores["clear-done"].$post())).removed;
}
