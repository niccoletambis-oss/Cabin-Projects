export const metadata = { title: "Overview | Cabin" };
import { OperationalOverview } from "@/components/operational-overview";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/security";
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
  const user = await requireUser();
  const financial = can(user.role, "finance");
  const [
    pendingReports,
    replacement,
    pendingPurchases,
    recentAudits,
    activity,
  ] = await Promise.all([
    db.damageReport.count({
      where: {
        status: { in: ["PENDING", "UNDER_REVIEW"] },
        ...(user.role === "CARETAKER"
          ? {
              OR: [
                { bookingId: null },
                { location: { assignments: { some: { userId: user.id } } } },
              ],
            }
          : {}),
      },
    }),
    db.damageReport.findMany({
      where: {
        status: "FOR_REPLACEMENT",
        ...(user.role === "CARETAKER"
          ? {
              OR: [
                { bookingId: null },
                { location: { assignments: { some: { userId: user.id } } } },
              ],
            }
          : {}),
      },
      select: { itemId: true },
      distinct: ["itemId"],
    }),
    financial
      ? db.purchase.count({ where: { status: "FOR_APPROVAL" } })
      : Promise.resolve(0),
    db.inventoryAudit.findMany({
      where: user.role === "CARETAKER" ? { userId: user.id } : {},
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    financial
      ? db.activityLog.findMany({
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);
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
  stats.push(
    {
      label: "Out of stock",
      value: items.filter((i) => i.quantity === 0).length,
      detail: "Items requiring replenishment",
      icon: Package,
    },
    {
      label: "Pending damage reports",
      value: pendingReports,
      detail: "Pending or under review",
      icon: TriangleAlert,
    },
    {
      label: "Items for replacement",
      value: new Set([
        ...replacement.map((r) => r.itemId),
        ...items
          .filter((i) => i.condition === "FOR_REPLACEMENT")
          .map((i) => i.id),
      ]).size,
      detail: "Reports awaiting replacement",
      icon: TriangleAlert,
    },
    {
      label: "Recent inventory audits",
      value: recentAudits.length,
      detail: "Your latest inventory checks",
      icon: Package,
    },
  );
  if (financial)
    stats.push({
      label: "Pending purchase requests",
      value: pendingPurchases,
      detail: "Awaiting Admin approval",
      icon: Wallet,
    });
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
        {stats
          .filter((s) => financial || s.label !== "Inventory value")
          .map((s) => (
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
      <OperationalOverview actor={user} pendingReportCount={pendingReports} />
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
            canEdit={can(user.role, "inventory:edit")}
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
      <section className="panel operation-card">
        <h2>Pending actions</h2>
        <div className="pending-actions">
          <Link className="button" href="/damage?type=DAMAGE">
            Report damage
          </Link>
          <Link className="button" href="/damage?type=MISSING">
            Report missing item
          </Link>
          <Link className="button" href="/audits">
            Inventory check
          </Link>
          <Link className="button" href="/low-stock">
            Restock essentials
          </Link>
          {financial && (
            <Link className="button" href="/purchases">
              Review purchase requests
            </Link>
          )}
        </div>
        <h2>Recent inventory audits</h2>
        {recentAudits.map((a) => (
          <p key={a.id}>
            <Link href={`/audits/${a.id}`}>
              AUD-{a.id.slice(-8).toUpperCase()} ·{" "}
              {a.status.replaceAll("_", " ")} · {dateTime(a.createdAt)}
            </Link>
          </p>
        ))}
        {!recentAudits.length && <p>No assigned or recent checks yet.</p>}
      </section>
      {financial && (
        <section className="panel operation-card">
          <h2>Recent activity</h2>
          {activity.map((a) => (
            <p key={a.id}>
              {dateTime(a.createdAt)} · {a.user?.name ?? "Legacy / system"} ·{" "}
              {a.action.replaceAll("_", " ")}
              <small>{a.details}</small>
            </p>
          ))}
          <Link className="button" href="/activity">
            All activity
          </Link>
        </section>
      )}
    </div>
  );
}
