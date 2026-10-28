import Link from "next/link";
import {
  Package,
  TriangleAlert,
  Wallet,
  MapPin,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Leaf,
} from "lucide-react";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { InventoryForm } from "@/components/inventory-form";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const [items, categories, locations, transactions] = await Promise.all([
    db.inventoryItem.findMany({
      include: { category: true, location: true },
      orderBy: { name: "asc" },
    }),
    db.category.findMany(),
    db.location.findMany(),
    db.stockTransaction.findMany({
      include: { item: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const low = items.filter((i) => i.quantity <= i.minimumStock);
  const value = items.reduce(
    (sum, i) => sum + i.quantity * Number(i.unitCost),
    0,
  );
  const stats = [
    {
      label: "Inventory items",
      value: items.length,
      detail: `Across ${categories.length} categories`,
      icon: Package,
    },
    {
      label: "Needs attention",
      value: low.length,
      detail: "Items at or below minimum",
      icon: TriangleAlert,
    },
    {
      label: "Inventory value",
      value: money(value),
      detail: "Based on current unit costs",
      icon: Wallet,
    },
    {
      label: "Locations & rooms",
      value: locations.length,
      detail: "Spaces you keep guest-ready",
      icon: MapPin,
    },
  ];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR CABIN, AT A GLANCE</span>
          <h1>A well-stocked welcome.</h1>
          <p>A little overview to help you take care of the everyday.</p>
        </div>
        <Link href="/inventory" className="button">
          View inventory <ArrowRight size={16} />
        </Link>
      </div>
      <section className="welcome-banner">
        <div>
          <span className="banner-tag">
            <Leaf size={14} /> THOUGHTFUL STAYS START HERE
          </span>
          <h2>Small details. Comfortable stays.</h2>
          <p>From fresh linens to morning coffee, keep the essentials ready.</p>
        </div>
        <div className="banner-art" aria-hidden="true">
          ⌂<span>THE CABIN</span>
        </div>
      </section>
      <div className="stats">
        {stats.map((s) => (
          <section className="stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <s.icon size={19} />
            </div>
            <strong>{s.value}</strong>
            <small>{s.detail}</small>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Time to restock</h2>
              <p>A little attention goes a long way.</p>
            </div>
            <span className="count-pill">{low.length} items</span>
          </div>
          {low.length ? (
            low.slice(0, 5).map((i) => (
              <div className="restock-row" key={i.id}>
                <span className="item-icon">
                  <Package size={20} />
                </span>
                <div className="grow">
                  <strong>{i.name}</strong>
                  <small>
                    {i.location.name} · Minimum {i.minimumStock} {i.unit}
                  </small>
                </div>
                <div className="stock-number">
                  <strong>
                    {i.quantity} <small>{i.unit}</small>
                  </strong>
                  <span
                    className={`badge ${i.quantity === 0 ? "empty" : "low"}`}
                  >
                    {i.quantity === 0 ? "Out of stock" : "Low stock"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              All stocked up. Your essentials are ready.
            </div>
          )}
          <Link href="/inventory" className="panel-link">
            Manage inventory <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel quick-panel">
          <span className="eyebrow">KEEP THINGS MOVING</span>
          <h2>Quick actions</h2>
          <p>
            A delivery arrived? Supplies going to a room? Keep your stock up to
            date.
          </p>
          <InventoryForm
            compact
            categories={categories}
            locations={locations}
            items={items.map(({ id, name }) => ({ id, name }))}
          />
          <div className="tip">
            <Leaf size={19} />
            <p>
              <strong>A good habit</strong>Record stock movements as they happen
              for a clear picture of your supplies.
            </p>
          </div>
        </section>
      </div>
      <section className="panel activity">
        <div className="panel-heading">
          <div>
            <h2>Recent stock activity</h2>
            <p>The latest comings and goings.</p>
          </div>
          <span className="muted">Latest 5 movements</span>
        </div>
        {transactions.map((t) => (
          <div className="activity-row" key={t.id}>
            <span className={`movement-icon ${t.type === "IN" ? "in" : "out"}`}>
              {t.type === "IN" ? (
                <ArrowDownLeft size={19} />
              ) : (
                <ArrowUpRight size={19} />
              )}
            </span>
            <div className="grow">
              <strong>{t.item.name}</strong>
              <small>{t.note}</small>
            </div>
            <span className={t.type === "IN" ? "quantity-in" : "quantity-out"}>
              {t.type === "IN" ? "+" : "−"}
              {t.quantity} {t.item.unit}
            </span>
            <time>{dateTime(t.createdAt)}</time>
          </div>
        ))}
        {!transactions.length && (
          <div className="empty-state">
            No movements yet. Add an item to get started.
          </div>
        )}
      </section>
      <p className="dev-notice">
        Development foundation · Shared caretaker workspace. Add authentication
        before using with real operational data.
      </p>
    </div>
  );
}
