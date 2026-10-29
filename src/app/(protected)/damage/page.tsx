import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/security";
import { ActionForm } from "@/components/action-form";
import { Field, Hidden } from "@/components/fields";
import { DamageStatus, ReportType } from "@prisma/client";
import { dateTime, money } from "@/lib/format";
export default async function Damage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const financial = can(user.role, "finance");
  const review = can(user.role, "review");
  const { type } = await searchParams;
  const [items, locations, reports] = await Promise.all([
    db.inventoryItem.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany(),
    db.damageReport.findMany({
      include: {
        item: true,
        user: { select: { name: true } },
        location: true,
        photos: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <div className="page">
      <h1>Damage & missing items</h1>
      <p>
        Report issues with photo evidence. A report never silently changes
        stock.
      </p>
      <details open={!!type} className="panel operation-card">
        <summary>Report damage / missing item</summary>
        <ActionForm intent="damage" label="Submit report">
          <div className="form-grid">
            <Field label="Item" name="itemId" options={items} required />
            <Field
              label="Report type"
              name="type"
              value={type === "MISSING" ? "MISSING" : "DAMAGE"}
              options={Object.values(ReportType)}
            />
            <Field
              label="Quantity"
              name="quantity"
              type="number"
              value={1}
              required
            />
            <Field
              label="Location"
              name="locationId"
              options={locations}
              required
            />
            {financial && (
              <Field
                label="Estimated replacement cost (PHP)"
                name="estimatedCost"
                type="number"
                value={0}
              />
            )}
          </div>
          <Field
            label="Description"
            name="description"
            type="textarea"
            required
          />
          <label>
            Photo evidence (JPEG / PNG / WebP, max 2 MB)
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
            />
          </label>
        </ActionForm>
      </details>
      <div className="record-grid">
        {reports.map((r) => (
          <section key={r.id} className="panel operation-card">
            <span className="badge low">{r.status.replaceAll("_", " ")}</span>
            <h2>{r.item.name}</h2>
            <p>
              {r.type} · {r.quantity} {r.item.unit} ·{" "}
              {r.location?.name ?? r.item.locationId}
            </p>
            <small>
              {dateTime(r.createdAt)} · Reported by{" "}
              {r.user?.name ?? "Legacy record"}
            </small>
            <p>{r.description}</p>
            {financial && (
              <p>
                Estimated replacement:{" "}
                {r.estimatedCost
                  ? money(Number(r.estimatedCost))
                  : "Not estimated"}
              </p>
            )}
            <p>Management: {r.managementRemarks || "Awaiting review"}</p>
            {r.photos.map((p) => (
              <p key={p.id}>
                <Link
                  className="button"
                  href={`/api/evidence/${p.id}`}
                  target="_blank"
                >
                  View protected photo evidence
                </Link>
              </p>
            ))}
            {review && (
              <details>
                <summary>Review report</summary>
                <ActionForm intent="review-damage">
                  <Hidden name="id" value={r.id} />
                  <Field
                    label="Status"
                    name="status"
                    value={r.status}
                    options={Object.values(DamageStatus)}
                  />
                  <Field
                    label="Estimated replacement cost (PHP)"
                    name="estimatedCost"
                    type="number"
                    value={Number(r.estimatedCost ?? 0)}
                  />
                  <Field
                    label="Management remarks"
                    name="managementRemarks"
                    type="textarea"
                    value={r.managementRemarks ?? ""}
                  />
                </ActionForm>
              </details>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
