import { describe, expect, it } from "vitest";

import { findWaiting, parseEntry } from "./item-entry.ts";

describe("reading a quantity out of what was typed", () => {
  it("takes a count from the start", () => {
    expect(parseEntry("2 milk")).toEqual({ name: "milk", quantity: "2" });
    expect(parseEntry("12 eggs")).toEqual({ name: "eggs", quantity: "12" });
    expect(parseEntry("2x milk")).toEqual({ name: "milk", quantity: "2" });
    expect(parseEntry("2 x milk")).toEqual({ name: "milk", quantity: "2" });
  });

  it("keeps a unit with its number", () => {
    expect(parseEntry("500g minced beef")).toEqual({ name: "minced beef", quantity: "500g" });
    expect(parseEntry("500 g minced beef")).toEqual({ name: "minced beef", quantity: "500 g" });
    expect(parseEntry("1.5 kg potatoes")).toEqual({ name: "potatoes", quantity: "1.5 kg" });
    expect(parseEntry("1,5 L milk")).toEqual({ name: "milk", quantity: "1,5 L" });
    expect(parseEntry("2 bags of rice")).toEqual({ name: "rice", quantity: "2 bags" });
    expect(parseEntry("3 tins chopped tomatoes")).toEqual({
      name: "chopped tomatoes",
      quantity: "3 tins",
    });
  });

  it("takes a count or an amount from the end", () => {
    expect(parseEntry("bananas x6")).toEqual({ name: "bananas", quantity: "6" });
    expect(parseEntry("bananas x 6")).toEqual({ name: "bananas", quantity: "6" });
    expect(parseEntry("bananas 6x")).toEqual({ name: "bananas", quantity: "6" });
    expect(parseEntry("chicken thighs 1kg")).toEqual({ name: "chicken thighs", quantity: "1kg" });
    expect(parseEntry("cola 1.5 l")).toEqual({ name: "cola", quantity: "1.5 l" });
  });

  it("drops a count of one", () => {
    expect(parseEntry("1 avocado")).toEqual({ name: "avocado", quantity: null });
    expect(parseEntry("1 kg flour")).toEqual({ name: "flour", quantity: "1 kg" });
  });

  it("leaves names that only look like they have a number", () => {
    expect(parseEntry("7up")).toEqual({ name: "7up", quantity: null });
    expect(parseEntry("100% orange juice")).toEqual({ name: "100% orange juice", quantity: null });
    expect(parseEntry("3D glasses")).toEqual({ name: "3D glasses", quantity: null });
    expect(parseEntry("Cola 330")).toEqual({ name: "Cola 330", quantity: null });
    expect(parseEntry("AA batteries")).toEqual({ name: "AA batteries", quantity: null });
    expect(parseEntry("12")).toEqual({ name: "12", quantity: null });
    expect(parseEntry("500 g")).toEqual({ name: "500 g", quantity: null });
  });

  it("reads a word that's also a unit as the item when nothing follows", () => {
    expect(parseEntry("2 rolls")).toEqual({ name: "rolls", quantity: "2" });
  });

  it("leaves the name alone when the quantity was typed in its own field", () => {
    expect(parseEntry("2 milk", "1 l")).toEqual({ name: "2 milk", quantity: "1 l" });
    expect(parseEntry("  milk ", "  ")).toEqual({ name: "milk", quantity: null });
  });

  it("never makes a quantity longer than the API takes", () => {
    expect(parseEntry("bananas x123456789012345678901")).toEqual({
      name: "bananas x123456789012345678901",
      quantity: null,
    });
  });
});

const item = (name: string, checked = false) => ({ name, checked });

describe("finding an item already on the list", () => {
  it("ignores case, accents, spacing and a plural", () => {
    const items = [item("Milk"), item("Crème fraîche"), item("Banana"), item("Cherry tomatoes")];
    expect(findWaiting(items, "milk")).toBe(items[0]);
    expect(findWaiting(items, " creme  fraiche ")).toBe(items[1]);
    expect(findWaiting(items, "bananas")).toBe(items[2]);
    expect(findWaiting(items, "cherry tomato")).toBe(items[3]);
  });

  it("matches -ies with -y", () => {
    expect(findWaiting([item("Strawberry")], "strawberries")?.name).toBe("Strawberry");
  });

  it("skips what's already in the cart", () => {
    expect(findWaiting([item("Milk", true)], "milk")).toBeUndefined();
  });

  it("doesn't match a different item", () => {
    expect(findWaiting([item("Oat milk")], "milk")).toBeUndefined();
    expect(findWaiting([item("Glass")], "glasses")).toBeUndefined();
  });
});
