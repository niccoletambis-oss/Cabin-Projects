import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const require = createRequire(import.meta.url);
const {
  encodeReply,
} = require("next/dist/compiled/react-server-dom-webpack/client.node");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const base = "http://127.0.0.1:3000";
const sku = `HTTP-${Date.now()}`;
try {
  for (const [path, expected] of [
    ["/", "A well-stocked welcome."],
    ["/inventory", "White bath towels"],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(expected));
  }
  const manifest = JSON.parse(
    await readFile(".next/server/server-reference-manifest.json", "utf8"),
  );
  const id = Object.keys(manifest.node).find(
    (id) => manifest.node[id].exportedName === "inventoryAction",
  );
  assert.ok(id);
  async function submit(fields, expected) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields))
      form.set(key, String(value));
    const body = await encodeReply([{ success: false, message: "" }, form]);
    const response = await fetch(base + "/inventory", {
      method: "POST",
      headers: { "Next-Action": id, Origin: base, Accept: "text/x-component" },
      body,
    });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(expected), expected);
  }
  const category = await db.category.findFirstOrThrow();
  const location = await db.location.findFirstOrThrow();
  await submit(
    {
      intent: "add",
      name: "HTTP test towels",
      sku,
      unit: "pcs",
      quantity: 5,
      minimumStock: 2,
      unitCost: 10,
      categoryId: category.id,
      locationId: location.id,
    },
    "Item added to inventory.",
  );
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { sku } });
  await submit(
    {
      intent: "stock",
      itemId: item.id,
      type: "IN",
      quantity: 3,
      note: "HTTP delivery",
    },
    "Stock updated successfully.",
  );
  await submit(
    {
      intent: "stock",
      itemId: item.id,
      type: "OUT",
      quantity: 2,
      note: "HTTP room supplies",
    },
    "Stock updated successfully.",
  );
  await submit(
    {
      intent: "stock",
      itemId: item.id,
      type: "OUT",
      quantity: 7,
      note: "HTTP overdraw",
    },
    "Not enough stock",
  );
  assert.equal(
    (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
      .quantity,
    6,
  );
  assert.equal(
    await db.stockTransaction.count({ where: { itemId: item.id } }),
    3,
  );
  console.log(
    "HTTP smoke passed: both pages, add item, stock in/out, and insufficient stock feedback.",
  );
} finally {
  const item = await db.inventoryItem.findUnique({ where: { sku } });
  if (item) {
    await db.stockTransaction.deleteMany({ where: { itemId: item.id } });
    await db.activityLog.deleteMany({ where: { entityId: item.id } });
    await db.inventoryItem.delete({ where: { id: item.id } });
  }
  await db.$disconnect();
}
