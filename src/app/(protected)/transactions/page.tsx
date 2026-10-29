import Link from "next/link";
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
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const movements = await db.stockTransaction.findMany({
    include: {
      item: { select: { name: true, unit: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * 50,
    take: 50,
  });
  return (
    <div className="page">
      <h1>Stock transactions</h1>
      <p>
        Immutable stock history. Corrections require a new, attributed movement.
      </p>
      <div className="record-grid">
        {movements.map((t) => (
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
      <div className="action-row">
        {page > 1 && (
          <Link className="button" href={`?page=${page - 1}`}>
            Previous
          </Link>
        )}
        {movements.length === 50 && (
          <Link className="button" href={`?page=${page + 1}`}>
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
