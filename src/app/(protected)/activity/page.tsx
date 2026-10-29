import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireUser("logs");
  const query = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const logs = await db.activityLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * 50,
    take: 50,
  });
  return (
    <div className="page">
      <h1>Activity log</h1>
      <p>Attributable, read-only history of sensitive operations.</p>
      <div className="record-grid">
        {logs.map((log) => (
          <section className="panel operation-card" key={log.id}>
            <small>
              {dateTime(log.createdAt)} · {log.user?.name ?? "Legacy / system"}{" "}
              · {log.role ?? "Legacy"}
            </small>
            <h2>{log.action.replaceAll("_", " ")}</h2>
            <p>{log.details}</p>
          </section>
        ))}
      </div>
      <div className="action-row">
        {page > 1 && (
          <Link href={`?page=${page - 1}`} className="button">
            Previous
          </Link>
        )}
        {logs.length === 50 && (
          <Link href={`?page=${page + 1}`} className="button">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
