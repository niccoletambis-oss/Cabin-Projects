export const metadata = { title: "Reports | Cabin" };
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
export default async function Reports() {
  await requireUser("reports");
  const [items, reports, audits, purchases] = await Promise.all([
    db.inventoryItem.findMany({ include: { category: true } }),
    db.damageReport.count({ where: { resolvedAt: null } }),
    db.inventoryAudit.count({ where: { status: "FOR_REVIEW" } }),
    db.purchase.count({ where: { status: "FOR_APPROVAL" } }),
  ]);
  const categories = [...new Set(items.map((i) => i.category.name))];
  return (
    <div className="page report-page">
      <h1>Operational reports</h1>
      <Link className="button primary" href="/reports/operations">
        Detailed reports, filters & exports
      </Link>
      <p>Live property inventory summaries. Currency: PHP.</p>
      <div className="record-grid">
        <section className="panel operation-card">
          <h2>Pending operations</h2>
          <p>
            Open damage reports: {reports}
            <br />
            Audits awaiting review: {audits}
            <br />
            Purchases awaiting approval: {purchases}
          </p>
        </section>
        {categories.map((category) => {
          const subset = items.filter((i) => i.category.name === category);
          return (
            <section className="panel operation-card" key={category}>
              <h2>{category}</h2>
              <p>
                {subset.length} items ·{" "}
                {subset.filter((i) => i.quantity <= i.minimumStock).length} low
                stock
              </p>
              <p>
                Value{" "}
                {money(
                  subset.reduce(
                    (n, i) => n + i.quantity * Number(i.unitCost),
                    0,
                  ),
                )}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
