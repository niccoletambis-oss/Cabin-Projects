import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/security";
import { suggestedOrder, stockLevel } from "@/lib/operations";
import { money } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { PurchaseFields } from "@/components/purchase-fields";
export default async function Restock() {
  const user = await requireUser();
  const financial = can(user.role, "finance");
  const [all, suppliers] = await Promise.all([
    db.inventoryItem.findMany({
      where: { status: "ACTIVE" },
      include: { supplier: true },
      orderBy: { name: "asc" },
    }),
    financial ? db.supplier.findMany({ where: { active: true } }) : [],
  ]);
  const items = all.filter((i) => i.quantity <= i.minimumStock);
  return (
    <div className="page">
      <h1>Low stock & restocking</h1>
      <p>
        {items.length} items need attention. Suggested orders restore stock
        above minimum.
      </p>
      <div className="record-grid">
        {items.map((i) => {
          const suggested = suggestedOrder(
            i.quantity,
            i.minimumStock,
            i.reorderQuantity,
          );
          return (
            <section className="panel operation-card" key={i.id}>
              <span className="badge low">
                {stockLevel(i.quantity, i.minimumStock)}
              </span>
              <h2>{i.name}</h2>
              <p>
                On hand {i.quantity} · Minimum {i.minimumStock} · Reorder{" "}
                {i.reorderQuantity}
              </p>
              <p>
                Suggested order:{" "}
                <strong>
                  {suggested} {i.unit}
                </strong>
                <br />
                Supplier: {i.supplier?.name ?? "Not assigned"}
              </p>
              {financial && (
                <p>
                  Unit cost {money(Number(i.unitCost))} · Estimated restock{" "}
                  {money(suggested * Number(i.unitCost))}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {can(user.role, "purchase:create") && (
        <section className="panel operation-card">
          <h2>Create request from low stock</h2>
          <ActionForm intent="purchase" label="Create purchase request">
            <PurchaseFields
              suppliers={suppliers}
              items={items.map((i) => ({
                id: i.id,
                name: i.name,
                quantity: suggestedOrder(
                  i.quantity,
                  i.minimumStock,
                  i.reorderQuantity,
                ),
                unitCost: Number(i.unitCost),
              }))}
            />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
