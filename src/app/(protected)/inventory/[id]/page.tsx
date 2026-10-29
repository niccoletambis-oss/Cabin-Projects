export const metadata = { title: "Inventory details | Cabin" };
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/security";
import { ActionForm } from "@/components/action-form";
import { Field, Hidden } from "@/components/fields";
import { notFound } from "next/navigation";
import { ItemCondition, ItemStatus } from "@prisma/client";
import { dateTime } from "@/lib/format";
export default async function ItemDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const item = await db.inventoryItem.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      supplier: true,
      transactions: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!item) notFound();
  const editable = can(user.role, "inventory:edit");
  const [categories, locations, suppliers] = editable
    ? await Promise.all([
        db.category.findMany(),
        db.location.findMany(),
        db.supplier.findMany({ where: { active: true } }),
      ])
    : [[], [], []];
  return (
    <div className="page">
      <h1>{item.name}</h1>
      <p>
        {item.sku} · {item.quantity} {item.unit} · {item.location.name} ·{" "}
        {item.condition.replaceAll("_", " ")} · {item.status}
      </p>
      <section className="panel operation-card">
        <h2>Item details</h2>
        {editable ? (
          <ActionForm intent="item">
            <Hidden name="id" value={id} />
            <div className="form-grid">
              <Field label="Name" name="name" value={item.name} required />
              <Field label="SKU" name="sku" value={item.sku} required />
              <Field
                label="Category"
                name="categoryId"
                value={item.categoryId}
                options={categories}
              />
              <Field
                label="Location"
                name="locationId"
                value={item.locationId}
                options={locations}
              />
              <Field label="Brand" name="brand" value={item.brand ?? ""} />
              <Field label="Unit" name="unit" value={item.unit} />
              <Field
                label="Minimum stock"
                name="minimumStock"
                type="number"
                value={item.minimumStock}
              />
              <Field
                label="Reorder quantity"
                name="reorderQuantity"
                type="number"
                value={item.reorderQuantity}
              />
              <Field
                label="Unit cost (PHP)"
                name="unitCost"
                type="number"
                value={Number(item.unitCost)}
              />
              <Field
                label="Supplier"
                name="supplierId"
                value={item.supplierId ?? ""}
                options={[
                  { id: "", name: "No supplier" },
                  ...suppliers,
                  ...(item.supplier &&
                  !suppliers.some((s) => s.id === item.supplierId)
                    ? [item.supplier]
                    : []),
                ]}
              />
              <Field
                label="Condition"
                name="condition"
                value={item.condition}
                options={Object.values(ItemCondition)}
              />
              <Field
                label="Status"
                name="status"
                value={item.status}
                options={Object.values(ItemStatus)}
              />
              <Field
                label="Date purchased"
                name="datePurchased"
                type="date"
                value={item.datePurchased?.toISOString().slice(0, 10) ?? ""}
              />
            </div>
            <Field
              label="Description"
              name="description"
              type="textarea"
              value={item.description ?? ""}
            />
            <Field
              label="Notes"
              name="notes"
              type="textarea"
              value={item.notes ?? ""}
            />
            <p>
              Stock quantity and transaction history are preserved. Use Stock In
              / Out to change stock.
            </p>
          </ActionForm>
        ) : (
          <>
            <p>
              {item.description || "No description"} · Brand:{" "}
              {item.brand || "—"}
            </p>
            <p>
              Minimum: {item.minimumStock} · Reorder: {item.reorderQuantity} ·
              Supplier: {item.supplier?.name || "—"}
            </p>
            <p>
              Purchased:{" "}
              {item.datePurchased ? dateTime(item.datePurchased) : "—"}
            </p>
            <p>{item.notes}</p>
          </>
        )}
      </section>
      <section className="panel operation-card">
        <h2>Recent stock history</h2>
        {item.transactions.map((t) => (
          <p key={t.id}>
            {dateTime(t.createdAt)} · {t.type} {t.quantity} · {t.note}
          </p>
        ))}
      </section>
    </div>
  );
}
