import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { dateTime } from "@/lib/format";
export default async function Audits() {
  const user = await requireUser("audit");
  const assignees =
    user.role === "CARETAKER"
      ? []
      : await db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
        });
  const [locations, audits] = await Promise.all([
    db.location.findMany(),
    db.inventoryAudit.findMany({
      where: user.role === "CARETAKER" ? { userId: user.id } : {},
      include: {
        user: { select: { name: true } },
        location: true,
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <div className="page">
      <h1>Inventory audits</h1>
      <p>
        Count a room, a location or the whole property. Counts are reviewed
        before any adjustment.
      </p>
      <section className="panel operation-card">
        <h2>Start inventory check</h2>
        <ActionForm intent="start-audit" label="Start audit">
          <Field
            label="Scope / room / location"
            name="locationId"
            options={[{ id: "", name: "Whole property" }, ...locations]}
          />
          {user.role !== "CARETAKER" && (
            <Field
              label="Assign inventory check to"
              name="assigneeId"
              value={user.id}
              options={assignees}
            />
          )}
          <Field label="Remarks / assigned task" name="note" type="textarea" />
        </ActionForm>
      </section>
      <h2>Audit history</h2>
      <div className="record-grid">
        {audits.map((a) => (
          <Link
            key={a.id}
            href={`/audits/${a.id}`}
            className="panel operation-card"
          >
            <h2>AUD-{a.id.slice(-8).toUpperCase()}</h2>
            <p>
              {a.location?.name ?? "Whole property"} ·{" "}
              {a.status.replaceAll("_", " ")}
            </p>
            <small>
              {dateTime(a.createdAt)} · {a.user?.name ?? "Legacy record"} ·{" "}
              {a._count.lines} items
            </small>
            <p>{a.note}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
