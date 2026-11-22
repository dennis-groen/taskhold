// HTTP layer for shopping lists: validates input, calls the service, picks status codes.
import { validate } from "../../lib/validation.ts";
import { protectedRouter } from "../auth/auth.middleware.ts";
import * as shoppingService from "./shopping.service.ts";
import {
  addItemBody,
  createListBody,
  forgetHistoryBody,
  itemParam,
  listBody,
  listParam,
  updateItemBody,
} from "./shopping.schema.ts";

export const shoppingRoutes = protectedRouter()
  // What the household has bought, for "buy again" suggestions
  .get("/history", async (c) => {
    const items = await shoppingService.getPurchaseHistory(c.get("user").id);
    return c.json({ items }, 200);
  })
  .post("/history/forget", validate("json", forgetHistoryBody), async (c) => {
    const removed = await shoppingService.forgetPurchaseHistory(
      c.get("user").id,
      c.req.valid("json").names,
    );
    return c.json({ removed }, 200);
  })
  .get("/lists", async (c) => {
    const lists = await shoppingService.getLists(c.get("user").id);
    return c.json({ lists }, 200);
  })
  .post("/lists", validate("json", createListBody), async (c) => {
    const list = await shoppingService.createList(c.get("user").id, c.req.valid("json"));
    return c.json({ list }, 201);
  })
  .get("/lists/:listId", validate("param", listParam), async (c) => {
    const { listId } = c.req.valid("param");
    const list = await shoppingService.getList(c.get("user").id, listId);
    return c.json({ list }, 200);
  })
  .patch("/lists/:listId", validate("param", listParam), validate("json", listBody), async (c) => {
    const { listId } = c.req.valid("param");
    await shoppingService.renameList(c.get("user").id, listId, c.req.valid("json").name);
    return c.body(null, 204);
  })
  .delete("/lists/:listId", validate("param", listParam), async (c) => {
    const { listId } = c.req.valid("param");
    await shoppingService.deleteList(c.get("user").id, listId);
    return c.body(null, 204);
  })
  .post(
    "/lists/:listId/items",
    validate("param", listParam),
    validate("json", addItemBody),
    async (c) => {
      const { listId } = c.req.valid("param");
      const item = await shoppingService.addItem(c.get("user").id, listId, c.req.valid("json"));
      return c.json({ item }, 201);
    },
  )
  .patch(
    "/lists/:listId/items/:itemId",
    validate("param", itemParam),
    validate("json", updateItemBody),
    async (c) => {
      const item = await shoppingService.updateItem(
        c.get("user").id,
        c.req.valid("param"),
        c.req.valid("json"),
      );
      return c.json({ item }, 200);
    },
  )
  .delete("/lists/:listId/items/:itemId", validate("param", itemParam), async (c) => {
    await shoppingService.deleteItem(c.get("user").id, c.req.valid("param"));
    return c.body(null, 204);
  })
  .post("/lists/:listId/clear-checked", validate("param", listParam), async (c) => {
    const { listId } = c.req.valid("param");
    const removed = await shoppingService.clearCheckedItems(c.get("user").id, listId);
    return c.json({ removed }, 200);
  });
