export const metadata = { title: "Stock transactions | Cabin" };
import { Pagination } from "@/components/pagination";
import { pageNumber, pageQuery, PAGE_SIZE } from "@/lib/pagination";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
export default async function Transactions({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireUser();
  const query = await searchParams;
  const page = pageNumber(query.page);
  const movements = await db.stockTransaction.findMany({
    include: {
      item: { select: { name: true, unit: true } },
      user: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageQuery(page),
  });
  return (
    <div className="page">
      <h1>Stock transactions</h1>
      <p>
        Immutable stock history. Corrections require a new, attributed movement.
      </p>
      <div className="record-grid">
        {movements.slice(0, PAGE_SIZE).map((t) => (
          <section className="panel operation-card" key={t.id}>
            <span className="badge good">
              {t.type} · {t.quantity} {t.item.unit}
            </span>
            <h2>{t.item.name}</h2>
            <p>{t.note}</p>
            <small>
              {dateTime(t.createdAt)} ·{" "}
              {t.user?.name ?? "Legacy / opening stock"}
            </small>
          </section>
        ))}
      </div>
      {!movements.length && (
        <p className="empty-state">No history on this page.</p>
      )}
      <Pagination page={page} hasNext={movements.length > PAGE_SIZE} />
    </div>
  );
}
