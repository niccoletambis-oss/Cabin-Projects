import { db } from "./db";
import { can, type Actor } from "./permissions";
import { roomScope } from "./stay-operations";
export async function expenseChoices(actor: Actor) {
  const financial = can(actor.role, "finance");
  const [bookings, suppliers, purchases, issues] = await Promise.all([
    db.booking.findMany({
      where:
        actor.role === "CARETAKER"
          ? { rooms: { some: { location: roomScope(actor) } } }
          : {},
      select: { id: true, reference: true },
    }),
    financial ? db.supplier.findMany({ select: { id: true, name: true } }) : [],
    financial
      ? db.purchase.findMany({ select: { id: true, reference: true } })
      : [],
    financial
      ? db.damageReport.findMany({
          select: { id: true, type: true, item: { select: { name: true } } },
        })
      : [],
  ]);
  return {
    financial,
    bookings: bookings.map((b) => ({ id: b.id, name: b.reference })),
    suppliers,
    purchases: purchases.map((p) => ({ id: p.id, name: p.reference })),
    issues: issues.map((i) => ({
      id: i.id,
      name: `${i.item.name} · ${i.type}`,
    })),
  };
}
