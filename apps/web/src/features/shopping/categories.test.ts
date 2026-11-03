import { describe, expect, it } from "vitest";

import { categorize, type Category } from "./categories.ts";

const EXAMPLES: [string, Category][] = [
  // The plain cases, as people type them
  ["Milk", "Dairy & Eggs"],
  ["minced meat", "Meat & Fish"],
  ["Apples", "Produce"],
  ["bananas", "Produce"],
  ["strawberries", "Produce"],
  ["tomatoes", "Produce"],
  ["potatoes", "Produce"],
  ["Bread", "Bakery"],
  ["2 baguettes", "Bakery"],
  ["Eggs", "Dairy & Eggs"],
  ["Greek yoghurt", "Dairy & Eggs"],
  ["Crème fraîche", "Dairy & Eggs"],
  ["chicken breasts", "Meat & Fish"],
  ["salmon fillets", "Meat & Fish"],
  ["Spaghetti", "Pantry"],
  ["Rice", "Pantry"],
  ["Toilet paper", "Household"],
  ["Toothpaste", "Personal care"],
  ["Coffee beans", "Drinks"],
  ["Crisps", "Snacks & Sweets"],
  ["Ice cream", "Frozen"],
  // A longer phrase beats the word inside it
  ["coconut milk", "Pantry"],
  ["peanut butter", "Pantry"],
  ["oat milk", "Dairy & Eggs"],
  ["burger buns", "Bakery"],
  ["cream crackers", "Snacks & Sweets"],
  ["sour cream", "Dairy & Eggs"],
  ["black pepper", "Pantry"],
  ["red peppers", "Produce"],
  ["egg noodles", "Pantry"],
  ["chicken nuggets", "Frozen"],
  ["kitchen roll", "Household"],
  // The main word comes last
  ["apple juice", "Drinks"],
  ["chicken soup", "Pantry"],
  ["beef stock", "Pantry"],
  ["chocolate milk", "Dairy & Eggs"],
  ["milk chocolate", "Snacks & Sweets"],
  ["strawberry yoghurt", "Dairy & Eggs"],
  ["ham and cheese croissant", "Bakery"],
  // Words that change everything
  ["frozen peas", "Frozen"],
  ["canned tuna", "Pantry"],
  ["tinned tomatoes", "Pantry"],
  // Words inside other words don't count
  ["hamburger", "Other"],
  ["eggplant", "Produce"],
  ["popcorn", "Snacks & Sweets"],
  ["watermelon", "Produce"],
  ["mints", "Snacks & Sweets"],
  ["fresh mint", "Produce"],
  // Nothing it knows
  ["birthday card", "Other"],
  ["screws", "Other"],
  ["constructor", "Other"],
  ["", "Other"],
];

describe("categorizing shopping items", () => {
  it.each(EXAMPLES)("%s → %s", (name, category) => {
    expect(categorize(name)).toBe(category);
  });
});
