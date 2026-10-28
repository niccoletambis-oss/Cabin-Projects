import { db } from "@/lib/db";
import { InventoryForm } from "@/components/inventory-form";
import { InventoryList } from "@/components/inventory-list";
export const dynamic = "force-dynamic";
export default async function InventoryPage() {
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
          categories={categories}
          locations={locations}
          items={items.map(({ id, name }) => ({ id, name }))}
        />
      </div>
      <InventoryList
        items={items.map((i) => ({ ...i, unitCost: Number(i.unitCost) }))}
      />
    </div>
  );
}
