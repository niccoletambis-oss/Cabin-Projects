export const metadata = { title: "Inventory | Cabin" };
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/security";
import { db } from "@/lib/db";
import { InventoryForm } from "@/components/inventory-form";
import { InventoryList } from "@/components/inventory-list";
export const dynamic = "force-dynamic";
export default async function InventoryPage() {
  const user = await requireUser();
  const financial = can(user.role, "finance");
  const [items, categories, locations] = await Promise.all([
    db.inventoryItem.findMany({
      include: { category: true, location: true },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A PLACE FOR EVERYTHING</span>
          <h1>Inventory</h1>
          <p>Know what you have, and what your cabin needs.</p>
        </div>
        <InventoryForm
          canEdit={can(user.role, "inventory:edit")}
          categories={categories}
          locations={locations}
          items={items.map(({ id, name }) => ({ id, name }))}
        />
      </div>
      <InventoryList
        showCosts={financial}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          unit: i.unit,
          quantity: i.quantity,
          minimumStock: i.minimumStock,
          category: { name: i.category.name },
          location: { name: i.location.name },
          unitCost: financial ? Number(i.unitCost) : null,
        }))}
      />
    </div>
  );
}
