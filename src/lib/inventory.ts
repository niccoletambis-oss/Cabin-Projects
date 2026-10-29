import { authorize, type Actor } from "./security";
import { db } from "./db";
import { itemSchema, stockSchema } from "./validation";
export async function createItem(actor: Actor, input: unknown) {
  authorize(actor, "inventory:edit");
  const data = itemSchema.parse(input);
  return db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({ data });
    if (data.quantity > 0)
      await tx.stockTransaction.create({
        data: {
          itemId: item.id,
          type: "IN",
          quantity: data.quantity,
          note: "Opening stock",
          userId: actor.id,
        },
      });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "ITEM_CREATED",
        entityId: item.id,
        details: `Added ${item.name}`,
      },
    });
    return item;
  });
}
export async function moveStock(actor: Actor, input: unknown) {
  authorize(actor, "stock");
  const data = stockSchema.parse(input);
  return db.$transaction(async (tx) => {
    // A conditional atomic update prevents concurrent stock-outs from going negative.
    const result = await tx.inventoryItem.updateMany({
      where: {
        id: data.itemId,
        ...(data.type === "OUT"
          ? { quantity: { gte: data.quantity } }
          : { quantity: { lte: 1_000_000 - data.quantity } }),
      },
      data: {
        quantity: {
          increment: data.type === "IN" ? data.quantity : -data.quantity,
        },
      },
    });
    if (result.count !== 1)
      throw new Error(
        data.type === "OUT"
          ? "Not enough stock available. Refresh and try a smaller quantity."
          : "Item unavailable or stock limit exceeded.",
      );
    await tx.stockTransaction.create({ data: { ...data, userId: actor.id } });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: `STOCK_${data.type}`,
        entityId: data.itemId,
        details: `${data.quantity} units: ${data.note}`,
      },
    });
  });
}
