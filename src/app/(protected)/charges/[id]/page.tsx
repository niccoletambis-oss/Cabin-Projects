export const metadata = { title: "Guest charges details | Cabin" };
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { StayForm } from "@/components/stay-form";
import { Field, Hidden } from "@/components/fields";
import { notFound } from "next/navigation";
import { dateTime, money } from "@/lib/format";
export default async function Charge({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("charge:review");
  const c = await db.guestCharge.findUnique({
    where: { id: (await params).id },
    include: {
      booking: { select: { reference: true, guestName: true } },
      damageReport: { include: { item: { select: { name: true } } } },
      approvedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!c) notFound();
  const transitions =
    c.status === "DRAFT"
      ? ["FOR_REVIEW", "WAIVED", "CANCELLED"]
      : c.status === "FOR_REVIEW"
        ? [
            ...(can(user.role, "charge:approve") ? ["APPROVED"] : []),
            "WAIVED",
            "CANCELLED",
          ]
        : c.status === "APPROVED"
          ? [
              "UNPAID",
              "PAID",
              ...(can(user.role, "charge:approve") ? ["WAIVED"] : []),
            ]
          : c.status === "UNPAID"
            ? ["PAID", ...(can(user.role, "charge:approve") ? ["WAIVED"] : [])]
            : [];
  return (
    <div className="page">
      <h1>Guest charge</h1>
      <small>{c.reference}</small>
      <section className="panel operation-card">
        <h2>Associated with booking {c.booking.reference}</h2>
        <p>
          {c.booking.guestName} · {c.damageReport.item.name} · Quantity{" "}
          {c.quantity}
        </p>
        <p>
          Replacement / repair cost: {money(Number(c.replacementCost))}
          <br />
          Proposed / approved charge: {money(Number(c.amount))}
        </p>
        <p>
          Status {c.status.replaceAll("_", " ")} · Payment {c.paymentStatus}
        </p>
        <p>
          {c.reason}
          <br />
          {c.notes}
        </p>
        <small>
          Reviewed {c.reviewedBy?.name ?? "Not yet"}{" "}
          {c.reviewedAt ? dateTime(c.reviewedAt) : ""}
          <br />
          Approved {c.approvedBy?.name ?? "Not yet"}{" "}
          {c.approvedAt ? dateTime(c.approvedAt) : ""}
          <br />
          Paid {c.paidAt ? dateTime(c.paidAt) : "Not recorded"}
        </small>
        <Link className="button" href={`/bookings/${c.bookingId}`}>
          Open booking
        </Link>
      </section>
      {c.status === "DRAFT" && (
        <details className="panel operation-card">
          <summary>Edit draft charge</summary>
          <StayForm intent="guest-charge" label="Save draft revision">
            <Hidden name="id" value={c.id} />
            <Hidden name="damageReportId" value={c.damageReportId} />
            <Field
              label="Affected quantity"
              name="quantity"
              type="number"
              value={c.quantity}
            />
            <Field
              label="Replacement / repair cost total (PHP)"
              name="replacementCost"
              type="number"
              value={Number(c.replacementCost)}
            />
            <Field
              label="Proposed charge amount (PHP)"
              name="amount"
              type="number"
              value={Number(c.amount)}
            />
            <Field
              label="Reason"
              name="reason"
              type="textarea"
              value={c.reason}
              required
            />
            <Field
              label="Notes"
              name="notes"
              type="textarea"
              value={c.notes ?? ""}
            />
          </StayForm>
        </details>
      )}
      <div className="record-grid">
        {transitions.map((status) => (
          <section className="panel operation-card" key={status}>
            <StayForm
              intent="charge-transition"
              label={status.replaceAll("_", " ")}
            >
              <Hidden name="id" value={c.id} />
              <Hidden name="status" value={status} />
              <Field
                label="Review / payment notes"
                name="notes"
                type="textarea"
                value={c.notes ?? ""}
              />
            </StayForm>
          </section>
        ))}
      </div>
      <p>
        Only an Admin / Owner may approve a charge or waive a charge already
        approved by the Owner.
      </p>
    </div>
  );
}
