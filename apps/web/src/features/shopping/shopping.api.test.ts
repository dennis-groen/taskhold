import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteItem, updateItem } from "./shopping.api.ts";

/** Records the request the RPC client makes, answering it with an empty success */
function recordRequests() {
  const requests: { method: string; path: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://app.test");
      requests.push({ method: init?.method ?? "GET", path: url.pathname + url.search + url.hash });
      return new Response(JSON.stringify({ item: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("list and item ids in request paths", () => {
  // A crafted link like /lists/<id>%3F hands the page a list id ending in "?". Unencoded, removing
  // an item would send DELETE /lists/<id>?/items/<item>, which the API reads as deleting the list.
  it.each(["list?", "list#", "list/other"])("keeps %j inside its own path segment", async (id) => {
    const requests = recordRequests();
    await deleteItem(id, "milk");
    await updateItem(id, "milk", { name: "Oat milk" });

    const encoded = encodeURIComponent(id);
    expect(requests).toEqual([
      { method: "DELETE", path: `/api/shopping/lists/${encoded}/items/milk` },
      { method: "PATCH", path: `/api/shopping/lists/${encoded}/items/milk` },
    ]);
  });
});
