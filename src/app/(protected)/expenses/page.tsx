export const metadata = { title: "Expenses | Cabin" };
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { pageNumber, pageQuery, PAGE_SIZE } from "@/lib/pagination";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dateTime, money } from "@/lib/format";
import { expenseSummary } from "@/lib/expense-summary";
export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const user = await requireUser("expense:submit");
  const financial = can(user.role, "finance");
  const expenses = await db.expense.findMany({
    where: financial ? {} : { recordedById: user.id },
    include: { recordedBy: { select: { name: true } } },
    orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
    ...pageQuery(page),
  });
  const summary = await expenseSummary(user);
  const month = summary.month;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>{financial ? "Expenses" : "My expense submissions"}</h1>
          <p>
            Submitted records are reviewed by management. Reviewed expenses and
            receipts are immutable.
          </p>
        </div>
        <Link className="button primary" href="/expenses/new">
          Add expense
        </Link>
      </div>
      {financial && (
        <section className="panel operation-card">
          <h2>Monthly expense summary · {month}</h2>
          <p>
            Approved {money(summary.approved)} · Submitted{" "}
            {money(summary.submitted)}
          </p>
          <Link href="/reports/operations?type=monthly-expenses">
            Monthly report & export →
          </Link>
        </section>
      )}
      <div className="record-grid">
        {expenses.slice(0, PAGE_SIZE).map((e) => (
          <Link
            className="panel operation-card"
            key={e.id}
            href={`/expenses/${e.id}`}
          >
            <StatusBadge status={e.status} />
            <h2>{e.description}</h2>
            <p>
              {money(Number(e.amount))} · {e.category.replaceAll("_", " ")}
            </p>
            <small>
              {e.reference ?? `EXP-${e.id.slice(-8)}`} ·{" "}
              {dateTime(e.incurredAt)} · {e.recordedBy?.name ?? "Legacy record"}
            </small>
          </Link>
        ))}
      </div>
      {!expenses.length && (
        <p className="empty-state">
          No records on this page. New records will appear here.
        </p>
      )}
      <Pagination page={page} hasNext={expenses.length > PAGE_SIZE} />
    </div>
  );
}
