import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { createItem, moveStock } from "../src/lib/inventory";
test("PostgreSQL: creation, duplicate SKU, stock changes, and concurrent overdraft prevention", async () => {
  const suffix = randomUUID();
  const category = await db.category.create({
    data: { name: `Test ${suffix}` },
  });
  const location = await db.location.create({
    data: { name: `Test ${suffix}` },
  });
  let id: string | undefined;
  try {
    const data = {
      name: "Test towels",
      sku: `TEST-${suffix.slice(0, 24)}`,
      unit: "pcs",
      quantity: 5,
      minimumStock: 2,
      unitCost: 10,
      categoryId: category.id,
      locationId: location.id,
    };
    const item = await createItem(data);
    id = item.id;
    assert.equal(item.quantity, 5);
    await assert.rejects(createItem(data));
    await moveStock({
      itemId: id,
      type: "IN",
      quantity: 3,
      note: "Test delivery",
    });
    await moveStock({
      itemId: id,
      type: "OUT",
      quantity: 2,
      note: "Guest room",
    });
    assert.equal(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id } })).quantity,
      6,
    );
    const outcomes = await Promise.allSettled([
      moveStock({ itemId: id, type: "OUT", quantity: 4, note: "First room" }),
      moveStock({ itemId: id, type: "OUT", quantity: 4, note: "Second room" }),
    ]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    assert.equal(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id } })).quantity,
      2,
    );
    assert.equal(await db.stockTransaction.count({ where: { itemId: id } }), 4);
    assert.equal(await db.activityLog.count({ where: { entityId: id } }), 4);
    await assert.rejects(
      moveStock({ itemId: id, type: "OUT", quantity: 3, note: "Too many" }),
    );
    assert.equal(await db.stockTransaction.count({ where: { itemId: id } }), 4);
  } finally {
    if (id) {
      await db.stockTransaction.deleteMany({ where: { itemId: id } });
      await db.activityLog.deleteMany({ where: { entityId: id } });
      await db.inventoryItem.delete({ where: { id } });
    }
    await db.category.delete({ where: { id: category.id } });
    await db.location.delete({ where: { id: location.id } });
    await db.$disconnect();
  }
});
