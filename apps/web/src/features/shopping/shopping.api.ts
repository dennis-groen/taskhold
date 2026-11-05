import { api, parseResponse, type InferResponseType } from "@/lib/api.ts";

const lists = api.shopping.lists;

export type ShoppingListSummary = InferResponseType<typeof lists.$get, 200>["lists"][number];
export type ShoppingList = InferResponseType<(typeof lists)[":listId"]["$get"], 200>["list"];
export type ShoppingItem = ShoppingList["items"][number];
export type BoughtItem = InferResponseType<typeof api.shopping.history.$get, 200>["items"][number];

/** What the household bought in the last year, one entry per name, for "buy again" */
export async function fetchHistory(): Promise<BoughtItem[]> {
  return (await parseResponse(api.shopping.history.$get())).items;
}

export async function fetchLists(): Promise<ShoppingListSummary[]> {
  return (await parseResponse(lists.$get())).lists;
}

export async function fetchList(listId: string): Promise<ShoppingList> {
  return (await parseResponse(lists[":listId"].$get({ param: { listId } }))).list;
}

export async function createList(name: string): Promise<ShoppingList> {
  return (await parseResponse(lists.$post({ json: { name } }))).list;
}

export async function renameList(listId: string, name: string): Promise<void> {
  await parseResponse(lists[":listId"].$patch({ param: { listId }, json: { name } }));
}

export async function deleteList(listId: string): Promise<void> {
  await parseResponse(lists[":listId"].$delete({ param: { listId } }));
}

export async function addItem(
  listId: string,
  item: { id: string; name: string; quantity: string | null },
): Promise<ShoppingItem> {
  return (await parseResponse(lists[":listId"].items.$post({ param: { listId }, json: item })))
    .item;
}

export async function updateItem(
  listId: string,
  itemId: string,
  changes: { name?: string; quantity?: string | null; checked?: boolean },
): Promise<ShoppingItem> {
  return (
    await parseResponse(
      lists[":listId"].items[":itemId"].$patch({ param: { listId, itemId }, json: changes }),
    )
  ).item;
}

export async function deleteItem(listId: string, itemId: string): Promise<void> {
  await parseResponse(lists[":listId"].items[":itemId"].$delete({ param: { listId, itemId } }));
}

/** Removes every checked item from the list */
export async function clearCheckedItems(listId: string): Promise<number> {
  return (await parseResponse(lists[":listId"]["clear-checked"].$post({ param: { listId } })))
    .removed;
}
