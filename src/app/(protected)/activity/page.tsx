export const metadata = { title: "Activity log | Cabin" };
import { Pagination } from "@/components/pagination";
import { pageNumber, pageQuery, PAGE_SIZE } from "@/lib/pagination";
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
  const page = pageNumber(query.page);
  const logs = await db.activityLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageQuery(page),
  });
  return (
    <div className="page">
      <h1>Activity log</h1>
      <p>Attributable, read-only history of sensitive operations.</p>
      <div className="record-grid">
        {logs.slice(0, PAGE_SIZE).map((log) => (
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
      {!logs.length && <p className="empty-state">No history on this page.</p>}
      <Pagination page={page} hasNext={logs.length > PAGE_SIZE} />
    </div>
  );
}
