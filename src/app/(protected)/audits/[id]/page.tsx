export const metadata = { title: "Inventory audits details | Cabin" };
import { AuditCount } from "@/components/audit-count";
import { auditFlag } from "@/lib/inventory-status";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/security";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, Hidden } from "@/components/fields";
import { ItemCondition } from "@prisma/client";
import { dateTime } from "@/lib/format";
export default async function Audit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("audit");
  const { id } = await params;
  const audit = await db.inventoryAudit.findUnique({
    where: { id },
    include: {
      lines: { include: { item: true } },
      user: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      location: true,
    },
  });
  if (!audit || (user.role === "CARETAKER" && audit.userId !== user.id))
    notFound();
  return (
    <div className="page">
      <h1>AUD-{id.slice(-8).toUpperCase()}</h1>
      <p>
        {audit.location?.name ?? "Whole property"} ·{" "}
        {audit.status.replaceAll("_", " ")} · {audit.user?.name}
      </p>
      <small>
        Started {dateTime(audit.createdAt)} · Completed{" "}
        {audit.completedAt ? dateTime(audit.completedAt) : "In progress"}
      </small>
      <p>{audit.note}</p>
      <ActionForm
        intent="complete-audit"
        showSubmit={audit.status === "IN_PROGRESS"}
        label="Complete count & submit for review"
      >
        <Hidden name="id" value={id} />
        <div className="record-grid">
          {audit.lines.map((line) => (
            <section className="panel operation-card" key={line.id}>
              <h2>{line.item.name}</h2>
              <p>
                Expected: {line.expectedQuantity} · Actual:{" "}
                {line.countedQuantity} · Difference:{" "}
                {line.countedQuantity - line.expectedQuantity}
              </p>
              <span className="badge low">
                {auditFlag(
                  line.expectedQuantity,
                  line.countedQuantity,
                  line.condition,
                )}
              </span>
              {audit.status === "IN_PROGRESS" ? (
                <AuditCount
                  id={line.id}
                  expected={line.expectedQuantity}
                  actual={line.countedQuantity}
                  condition={line.condition}
                  remarks={line.remarks ?? ""}
                  conditions={Object.values(ItemCondition)}
                />
              ) : (
                <p>
                  {line.condition} · {line.remarks}
                </p>
              )}
            </section>
          ))}
        </div>
        {audit.status !== "IN_PROGRESS" && (
          <p>This count is saved. Further count submissions are rejected.</p>
        )}
      </ActionForm>
      {can(user.role, "review") && audit.status === "FOR_REVIEW" && (
        <section className="panel operation-card">
          <h2>Management review</h2>
          <ActionForm intent="review-audit">
            <Hidden name="id" value={id} />
            <Field
              label="Review remarks"
              name="remarks"
              type="textarea"
              required
            />
            <Field
              label="Decision"
              name="adjust"
              options={[
                { id: "false", name: "Review only — keep stock unchanged" },
                { id: "true", name: "Approve and apply counted quantities" },
              ]}
            />
            <p>
              Adjustments are rejected if items changed since the audit started.
              Each adjustment creates a stock transaction.
            </p>
          </ActionForm>
        </section>
      )}
      {audit.reviewedAt && (
        <p>
          Reviewed {dateTime(audit.reviewedAt)} by {audit.reviewedBy?.name}:{" "}
          {audit.reviewRemarks}
        </p>
      )}
    </div>
  );
}
