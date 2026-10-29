import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { PurchaseFields } from "@/components/purchase-fields";
import { dateTime, money } from "@/lib/format";
export default async function Purchases() {
  await requireUser("purchase:create");
  const [items, suppliers, purchases] = await Promise.all([
    db.inventoryItem.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({ where: { active: true } }),
    db.purchase.findMany({
      include: {
        supplier: true,
        requestedBy: { select: { name: true } },
        lines: true,
      },
      orderBy: { purchasedAt: "desc" },
    }),
  ]);
  return (
    <div className="page">
      <h1>Purchase requests</h1>
      <p>
        Request, approve, purchase and receive. Only an Owner / Admin may
        approve.
      </p>
      <details className="panel operation-card">
        <summary>New purchase request</summary>
        <ActionForm intent="purchase" label="Create request">
          <PurchaseFields
            suppliers={suppliers}
            items={items.map((i) => ({
              id: i.id,
              name: i.name,
              quantity: i.reorderQuantity || 1,
              unitCost: Number(i.unitCost),
            }))}
          />
        </ActionForm>
      </details>
      <div className="record-grid">
        {purchases.map((p) => (
          <Link
            href={`/purchases/${p.id}`}
            key={p.id}
            className="panel operation-card"
          >
            <span className="badge low">{p.status.replaceAll("_", " ")}</span>
            <h2>{p.reference}</h2>
            <p>
              {p.supplier.name} ·{" "}
              {money(
                p.lines.reduce(
                  (n, l) => n + l.quantity * Number(l.unitCost),
                  0,
                ),
              )}
            </p>
            <small>
              {dateTime(p.purchasedAt)} ·{" "}
              {p.requestedBy?.name ?? "Legacy record"}
            </small>
          </Link>
        ))}
      </div>
    </div>
  );
}
