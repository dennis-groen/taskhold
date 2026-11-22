import { describe, expect, it } from "vitest";

import { stepQuantity } from "./item-quantity.ts";

describe("stepping a quantity", () => {
  it("starts from one when there's no quantity yet", () => {
    expect(stepQuantity("", 1)).toBe("2");
    expect(stepQuantity("  ", 1)).toBe("2");
    expect(stepQuantity("", -1)).toBeNull();
  });

  it("counts whole numbers up and down, and clears below one", () => {
    expect(stepQuantity("2", 1)).toBe("3");
    expect(stepQuantity("9", 1)).toBe("10");
    expect(stepQuantity("2", -1)).toBe("1");
    expect(stepQuantity("1", -1)).toBe("");
    expect(stepQuantity("0", -1)).toBe("");
  });

  it("keeps what's written after the number", () => {
    expect(stepQuantity("2 bags", 1)).toBe("3 bags");
    expect(stepQuantity("6x", -1)).toBe("5x");
    expect(stepQuantity("1 tin", -1)).toBe("");
  });

  it("leaves quantities it can't count alone", () => {
    expect(stepQuantity("a few", 1)).toBeNull();
    expect(stepQuantity("1.5 kg", 1)).toBeNull();
    expect(stepQuantity("1,5 kg", -1)).toBeNull();
    expect(stepQuantity("12.5 kg", 1)).toBeNull();
    expect(stepQuantity("2,25 l", -1)).toBeNull();
    expect(stepQuantity("½", 1)).toBeNull();
  });

  it("leaves weights and volumes alone, where one more gram means nothing", () => {
    expect(stepQuantity("500g", 1)).toBeNull();
    expect(stepQuantity("500 g", -1)).toBeNull();
    expect(stepQuantity("2 kg", 1)).toBeNull();
    expect(stepQuantity("250ml", 1)).toBeNull();
    expect(stepQuantity("2 L", 1)).toBeNull();
    expect(stepQuantity("1 litre", 1)).toBeNull();
    expect(stepQuantity("16 oz", 1)).toBeNull();
    expect(stepQuantity("500 gr", 1)).toBeNull();
    expect(stepQuantity("1 gal", 1)).toBeNull();
    expect(stepQuantity("2 cups", -1)).toBeNull();
    // Words that only start like a unit still count
    expect(stepQuantity("2 large", 1)).toBe("3 large");
    expect(stepQuantity("2 loaves", 1)).toBe("3 loaves");
    expect(stepQuantity("3 glasses", -1)).toBe("2 glasses");
  });

  it("never goes past the 20 characters the API takes", () => {
    expect(stepQuantity("9 extra large boxes!", 1)).toBeNull();
    expect(stepQuantity("8 extra large boxes!", 1)).toBe("9 extra large boxes!");
  });
});
