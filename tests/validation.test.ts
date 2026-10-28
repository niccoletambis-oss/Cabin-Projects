import { test } from "node:test";
import assert from "node:assert/strict";
import { itemSchema, stockSchema } from "../src/lib/validation";
const item = {
  name: "Bath towels",
  sku: "lin-100",
  unit: "pcs",
  quantity: "12",
  minimumStock: "4",
  unitCost: "125.50",
  categoryId: "linen",
  locationId: "room",
};
test("item input normalizes SKU and form numbers", () => {
  const parsed = itemSchema.parse(item);
  assert.equal(parsed.sku, "LIN-100");
  assert.equal(parsed.quantity, 12);
  assert.equal(parsed.unitCost, 125.5);
});
test("items reject negative or fractional stock, invalid SKU, and invalid currency precision", () => {
  for (const change of [
    { quantity: -1 },
    { quantity: 1.5 },
    { sku: "bad sku" },
    { unitCost: 1.234 },
    { name: " " },
    { categoryId: "" },
  ])
    assert.equal(itemSchema.safeParse({ ...item, ...change }).success, false);
});
test("stock movements require positive whole quantities and a reason", () => {
  for (const change of [
    { quantity: 0 },
    { quantity: -2 },
    { quantity: 1.5 },
    { note: " " },
    { type: "INVALID" },
  ])
    assert.equal(
      stockSchema.safeParse({
        itemId: "id",
        type: "OUT",
        quantity: 2,
        note: "Guest room",
        ...change,
      }).success,
      false,
    );
  assert.equal(
    stockSchema.parse({
      itemId: "id",
      type: "IN",
      quantity: "3",
      note: "Delivery",
    }).quantity,
    3,
  );
});
