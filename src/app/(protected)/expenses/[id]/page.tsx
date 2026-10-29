import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { expenseChoices } from "@/lib/expense-choices";
import { ExpenseFields } from "@/components/expense-fields";
import { StayForm } from "@/components/stay-form";
import { Hidden } from "@/components/fields";
import { dateTime, money } from "@/lib/format";
export default async function Expense({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("expense:submit");
  const financial = can(user.role, "expense:manage");
  const expense = await db.expense.findFirst({
    where: {
      id: (await params).id,
      ...(financial ? {} : { recordedById: user.id }),
    },
    include: {
      attachments: { select: { id: true } },
      recordedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!expense) notFound();
  return (
    <div className="page">
      <h1>Expense details</h1>
      <section className="panel operation-card">
        <small>{expense.reference ?? `EXP-${expense.id.slice(-8)}`}</small>
        <h2>{expense.description}</h2>
        <p>
          {money(Number(expense.amount))} · {expense.status} ·{" "}
          {expense.category.replaceAll("_", " ")}
        </p>
        <p>
          {dateTime(expense.incurredAt)} · {expense.payee || "No payee"} ·{" "}
          {expense.paymentMethod.replaceAll("_", " ")} · Receipt{" "}
          {expense.receiptNumber || "Not entered"}
        </p>
        <p>{expense.notes}</p>
        <small>
          Recorded by {expense.recordedBy?.name ?? "Legacy record"} · Reviewed
          by {expense.reviewedBy?.name ?? "Not yet"}{" "}
          {expense.reviewedAt ? dateTime(expense.reviewedAt) : ""}
        </small>
        {expense.attachments.map((a) => (
          <p key={a.id}>
            <Link
              href={`/api/attachments/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open protected receipt
            </Link>
          </p>
        ))}
      </section>
      {expense.status === "SUBMITTED" && (
        <section className="panel operation-card">
          <h2>Attach receipt</h2>
          <StayForm intent="attachment" label="Attach receipt">
            <Hidden name="expenseId" value={expense.id} />
            <label>
              JPEG / PNG / WebP / PDF, up to 2 MB
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
              />
            </label>
          </StayForm>
        </section>
      )}
      {financial && expense.status === "SUBMITTED" && (
        <>
          <details className="panel operation-card">
            <summary>Edit submitted expense</summary>
            <StayForm intent="expense">
              <Hidden name="id" value={expense.id} />
              <ExpenseFields
                expense={expense}
                {...await expenseChoices(user)}
              />
            </StayForm>
          </details>
          <div className="action-row">
            {["APPROVED", "REJECTED"].map((status) => (
              <StayForm
                key={status}
                intent="expense-review"
                label={
                  status === "APPROVED" ? "Approve expense" : "Reject expense"
                }
              >
                <Hidden name="id" value={expense.id} />
                <Hidden name="status" value={status} />
              </StayForm>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
