import { assertDevelopmentSeed } from "../src/lib/environment";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  assertDevelopmentSeed();
  await db.user.upsert({
    where: { email: "caretaker@cabin.example" },
    update: {},
    create: {
      name: "Cabin Caretaker",
      email: "caretaker@cabin.example",
      role: "CARETAKER",
    },
  });
  const categories = await Promise.all(
    [
      "Linen & Bedding",
      "Toiletries",
      "Cleaning",
      "Kitchen",
      "Room Essentials",
    ].map((name) =>
      db.category.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );
  const locations = await Promise.all(
    [
      "Linen Room",
      "Supply Closet",
      "Kitchen",
      "Room 01",
      "Room 02",
      "Room 03",
    ].map((name) =>
      db.location.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );
  const samples = [
    ["White bath towels", "LIN-001", "pcs", 36, 12, 280, 0, 0],
    ["Queen bed sheets", "LIN-002", "sets", 18, 8, 850, 0, 0],
    ["Pillowcases", "LIN-003", "pcs", 7, 12, 120, 0, 0],
    ["Guest shampoo", "TOI-001", "bottles", 48, 20, 35, 1, 1],
    ["Hand soap", "TOI-002", "bottles", 6, 10, 65, 1, 1],
    ["Toilet paper", "TOI-003", "rolls", 32, 16, 28, 1, 1],
    ["All-purpose cleaner", "CLN-001", "bottles", 8, 4, 150, 2, 1],
    ["Laundry detergent", "CLN-002", "kg", 0, 5, 180, 2, 0],
    ["Coffee sachets", "KIT-001", "pcs", 64, 24, 12, 3, 2],
    ["Drinking glasses", "KIT-002", "pcs", 24, 12, 75, 3, 2],
    ["Guest slippers", "ROM-001", "pairs", 15, 10, 90, 4, 1],
    ["Bedside lamps", "ROM-002", "pcs", 2, 1, 650, 4, 3],
  ] as const;
  for (const [
    name,
    sku,
    unit,
    quantity,
    minimumStock,
    unitCost,
    c,
    l,
  ] of samples) {
    const existing = await db.inventoryItem.findUnique({ where: { sku } });
    if (!existing)
      await db.inventoryItem.create({
        data: {
          name,
          sku,
          unit,
          quantity,
          minimumStock,
          unitCost,
          categoryId: categories[c].id,
          locationId: locations[l].id,
          transactions: quantity
            ? { create: { type: "IN", quantity, note: "Sample opening stock" } }
            : undefined,
        },
      });
  }
  console.log(
    "Seed complete: 12 sample inventory items. Existing stock preserved.",
  );
}
main().finally(() => db.$disconnect());
