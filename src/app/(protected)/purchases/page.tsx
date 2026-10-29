export const metadata = { title: "Purchases | Cabin" };
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { pageNumber, pageQuery, PAGE_SIZE } from "@/lib/pagination";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { PurchaseFields } from "@/components/purchase-fields";
import { dateTime, money } from "@/lib/format";
export default async function Purchases({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; supplierId?: string }>;
}) {
  const query = await searchParams;
  const page = pageNumber(query.page);
  const supplierId =
    typeof query.supplierId === "string" ? query.supplierId.slice(0, 100) : "";
  await requireUser("purchase:create");
  const [items, suppliers, purchases] = await Promise.all([
    db.inventoryItem.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({ where: { active: true } }),
    db.purchase.findMany({
      where: supplierId ? { supplierId } : {},
      include: {
        supplier: true,
        requestedBy: { select: { name: true } },
        lines: true,
      },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      ...pageQuery(page),
    }),
  ]);
  return (
    <div className="page">
      <h1>Purchase requests</h1>
      <p>
        Request, approve, purchase and receive. Only an Owner / Admin may
        approve.
      </p>
      {supplierId && (
        <p>
          Showing this supplier’s requests.{" "}
          <Link className="button" href="/purchases">
            View all suppliers
          </Link>
        </p>
      )}
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
        {purchases.slice(0, PAGE_SIZE).map((p) => (
          <Link
            href={`/purchases/${p.id}`}
            key={p.id}
            className="panel operation-card"
          >
            <StatusBadge status={p.status} />
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
      {!purchases.length && (
        <p className="empty-state">
          No records on this page. New records will appear here.
        </p>
      )}
      <Pagination
        page={page}
        hasNext={purchases.length > PAGE_SIZE}
        query={{ supplierId }}
      />
    </div>
  );
}
