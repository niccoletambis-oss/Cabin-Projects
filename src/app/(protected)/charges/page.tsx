export const metadata = { title: "Guest charges | Cabin" };
import { Pagination } from "@/components/pagination";
import { pageNumber, pageQuery, PAGE_SIZE } from "@/lib/pagination";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StayForm } from "@/components/stay-form";
import { Field } from "@/components/fields";
import { money, dateTime } from "@/lib/format";
export default async function Charges({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; page?: string }>;
}) {
  await requireUser("charge:review");
  const query = await searchParams;
  const { report } = query;
  const page = pageNumber(query.page);
  const [charges, issues] = await Promise.all([
    db.guestCharge.findMany({
      include: {
        booking: { select: { reference: true, guestName: true } },
        damageReport: { include: { item: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageQuery(page),
    }),
    db.damageReport.findMany({
      where: {
        bookingId: { not: null },
        reviewedAt: { not: null },
        status: {
          in: [
            "FOR_REPAIR",
            "FOR_REPLACEMENT",
            "REPLACED",
            "WRITTEN_OFF",
            "RESOLVED",
          ],
        },
        guestCharge: { is: null },
      },
      include: {
        booking: { select: { reference: true } },
        item: { select: { name: true } },
      },
    }),
  ]);
  const selected = issues.find((i) => i.id === report);
  return (
    <div className="page">
      <h1>Guest charges</h1>
      <p>
        Associated issues require management review and separate Owner approval.
        This is tracking only, without payment gateways.
      </p>
      <details className="panel operation-card" open={!!report}>
        <summary>Draft charge from a reviewed issue</summary>
        <StayForm intent="guest-charge" label="Create draft charge">
          <Field
            label="Reviewed issue"
            name="damageReportId"
            value={selected?.id ?? ""}
            options={[
              { id: "", name: "Select reviewed issue" },
              ...issues.map((i) => ({
                id: i.id,
                name: `${i.booking?.reference} · ${i.item.name} · ${i.type}`,
              })),
            ]}
            required
          />
          <Field
            label="Affected quantity"
            name="quantity"
            type="number"
            value={selected?.quantity ?? 1}
          />
          <Field
            label="Replacement / repair cost total (PHP)"
            name="replacementCost"
            type="number"
            value={Number(selected?.estimatedCost ?? 0)}
          />
          <Field
            label="Proposed charge amount (PHP)"
            name="amount"
            type="number"
            value={Number(selected?.estimatedCost ?? 0)}
          />
          <Field
            label="Reason for proposed charge"
            name="reason"
            type="textarea"
            required
          />
          <Field label="Notes" name="notes" type="textarea" />
        </StayForm>
      </details>
      <div className="record-grid">
        {charges.slice(0, PAGE_SIZE).map((c) => (
          <Link
            key={c.id}
            className="panel operation-card"
            href={`/charges/${c.id}`}
          >
            <span className="badge low">
              {c.status.replaceAll("_", " ")} · {c.paymentStatus}
            </span>
            <h2>
              {c.booking.reference} · {c.booking.guestName}
            </h2>
            <p>
              {c.damageReport.item.name} · {c.quantity} affected
              <br />
              Replacement {money(Number(c.replacementCost))} · Charge{" "}
              {money(Number(c.amount))}
            </p>
            <small>{dateTime(c.createdAt)}</small>
          </Link>
        ))}
      </div>
      {!charges.length && (
        <p className="empty-state">No records on this page.</p>
      )}
      <Pagination
        page={page}
        hasNext={charges.length > PAGE_SIZE}
        query={{ report: report ?? "" }}
      />
    </div>
  );
}
