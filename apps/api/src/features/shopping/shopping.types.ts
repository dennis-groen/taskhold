// Shapes the shopping feature returns to clients

export type ShoppingListSummary = {
  id: string;
  name: string;
  /** All items, bought or not */
  itemCount: number;
  /** Items still to buy */
  openCount: number;
};

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  checked: boolean;
  /** Null when the person who added it has left */
  addedBy: { id: string; name: string } | null;
  checkedBy: { id: string; name: string } | null;
  checkedAt: Date | null;
  createdAt: Date;
};

export type ShoppingList = {
  id: string;
  name: string;
  items: ShoppingItem[];
};
