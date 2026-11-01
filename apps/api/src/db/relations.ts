import { defineRelations } from "drizzle-orm";

import * as schema from "./schema.ts";

// Drizzle v1 keeps relational metadata in one definition rather than on each table.
export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
    accounts: r.many.account({ from: r.user.id, to: r.account.userId }),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false }),
  },
  household: {
    members: r.many.householdMember({
      from: r.household.id,
      to: r.householdMember.householdId,
    }),
  },
  householdMember: {
    household: r.one.household({
      from: r.householdMember.householdId,
      to: r.household.id,
      optional: false,
    }),
    user: r.one.user({ from: r.householdMember.userId, to: r.user.id, optional: false }),
  },
  shoppingList: {
    household: r.one.household({
      from: r.shoppingList.householdId,
      to: r.household.id,
      optional: false,
    }),
    items: r.many.shoppingItem({ from: r.shoppingList.id, to: r.shoppingItem.listId }),
  },
  shoppingItem: {
    list: r.one.shoppingList({
      from: r.shoppingItem.listId,
      to: r.shoppingList.id,
      optional: false,
    }),
  },
  chore: {
    household: r.one.household({
      from: r.chore.householdId,
      to: r.household.id,
      optional: false,
    }),
    completions: r.many.choreCompletion({ from: r.chore.id, to: r.choreCompletion.choreId }),
  },
  choreCompletion: {
    chore: r.one.chore({
      from: r.choreCompletion.choreId,
      to: r.chore.id,
      optional: false,
    }),
  },
}));
