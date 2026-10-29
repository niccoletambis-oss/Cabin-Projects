import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dateTime, money } from "@/lib/format";
import { manilaDay } from "@/lib/stay-status";
export default async function Expenses() {
  const user = await requireUser("expense:submit");
  const financial = can(user.role, "finance");
  const expenses = await db.expense.findMany({
    where: financial ? {} : { recordedById: user.id },
    include: { recordedBy: { select: { name: true } } },
    orderBy: { incurredAt: "desc" },
  });
  const month = manilaDay().slice(0, 7);
  const monthly = expenses.filter((e) =>
    manilaDay(e.incurredAt).startsWith(month),
  );
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
            Approved{" "}
            {money(
              monthly
                .filter((e) => e.status === "APPROVED")
                .reduce((n, e) => n + Number(e.amount), 0),
            )}{" "}
            · Submitted{" "}
            {money(
              monthly
                .filter((e) => e.status === "SUBMITTED")
                .reduce((n, e) => n + Number(e.amount), 0),
            )}
          </p>
          <Link href="/reports/operations?type=monthly-expenses">
            Monthly report & export →
          </Link>
        </section>
      )}
      <div className="record-grid">
        {expenses.map((e) => (
          <Link
            className="panel operation-card"
            key={e.id}
            href={`/expenses/${e.id}`}
          >
            <span className="badge low">{e.status}</span>
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
    </div>
  );
}
