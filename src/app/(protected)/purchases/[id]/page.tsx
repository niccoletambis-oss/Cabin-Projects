export const metadata = { title: "Purchases details | Cabin" };
import { EvidencePanel } from "@/components/evidence-panel";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/security";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Hidden } from "@/components/fields";
import { dateTime, money } from "@/lib/format";
export default async function Purchase({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("purchase:create");
  const { id } = await params;
  const p = await db.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: { include: { item: true } },
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
    },
  });
  if (!p) notFound();
  const transitions =
    p.status === "DRAFT"
      ? ["FOR_APPROVAL", "CANCELLED"]
      : p.status === "FOR_APPROVAL"
        ? [
            ...(can(user.role, "purchase:approve") ? ["APPROVED"] : []),
            "CANCELLED",
          ]
        : p.status === "APPROVED"
          ? ["PURCHASED", "RECEIVED", "CANCELLED"]
          : p.status === "PURCHASED"
            ? ["RECEIVED", "CANCELLED"]
            : [];
  return (
    <div className="page">
      <h1>{p.reference}</h1>
      <p>
        {p.status.replaceAll("_", " ")} · {p.supplier.name}
      </p>
      <small>
        Requested {dateTime(p.purchasedAt)} by{" "}
        {p.requestedBy?.name ?? "Legacy record"}
      </small>
      <p>{p.notes}</p>
      <section className="panel operation-card">
        <h2>Requested items</h2>
        {p.lines.map((l) => (
          <p key={l.id}>
            {l.item.name} · {l.quantity} × {money(Number(l.unitCost))} ={" "}
            {money(l.quantity * Number(l.unitCost))}
          </p>
        ))}
        <h2>
          Total:{" "}
          {money(
            p.lines.reduce((n, l) => n + l.quantity * Number(l.unitCost), 0),
          )}
        </h2>
      </section>
      <p>
        Approved: {p.approvedBy?.name ?? "Not approved"}{" "}
        {p.approvedAt ? dateTime(p.approvedAt) : ""}
        <br />
        Received: {p.receivedBy?.name ?? "Not received"}{" "}
        {p.receivedAt ? dateTime(p.receivedAt) : ""}
      </p>
      <div className="action-row wrap">
        {transitions.map((status) => (
          <ActionForm
            key={status}
            intent="transition-purchase"
            label={status.replaceAll("_", " ")}
          >
            <Hidden name="id" value={id} />
            <Hidden name="status" value={status} />
          </ActionForm>
        ))}
      </div>
      <p>Receiving is atomic and may happen only once.</p>
      <EvidencePanel parent={{ purchaseId: id }} />
    </div>
  );
}
