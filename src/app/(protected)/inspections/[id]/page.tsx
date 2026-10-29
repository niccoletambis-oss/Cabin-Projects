import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertRoom } from "@/lib/stay-operations";
import { inspectionFlags } from "@/lib/stay-status";
import { notFound } from "next/navigation";
import { StayForm } from "@/components/stay-form";
import { Field, Hidden } from "@/components/fields";
import { InspectionCount } from "@/components/inspection-count";
import { dateTime } from "@/lib/format";
export default async function Inspection({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("inspection");
  const { id } = await params;
  const inspection = await db.stayInspection.findUnique({
    where: { id },
    include: {
      booking: { select: { reference: true, guestName: true } },
      location: true,
      user: { select: { name: true } },
      lines: {
        include: {
          attachments: { select: { id: true } },
          damageReport: { select: { id: true } },
        },
        orderBy: { itemName: "asc" },
      },
    },
  });
  if (!inspection) notFound();
  try {
    await assertRoom(user, inspection.locationId);
  } catch {
    notFound();
  }
  const draft = inspection.status === "DRAFT";
  return (
    <div className="page">
      <h1>
        {inspection.type === "CHECK_IN" ? "Check-in" : "Check-out"} inspection
      </h1>
      <p>
        {inspection.location.name} ·{" "}
        <Link href={`/bookings/${inspection.bookingId}`}>
          {inspection.booking.reference}
        </Link>{" "}
        · {inspection.booking.guestName}
      </p>
      <small>
        {inspection.status} · {inspection.user.name} ·{" "}
        {dateTime(inspection.completedAt ?? inspection.createdAt)}
      </small>
      <p>
        Check-in records establish a baseline. Associated issues do not
        establish guest responsibility and never create automatic charges.
      </p>
      <StayForm
        intent="inspection-save"
        label="Save inspection"
        showSubmit={draft}
      >
        <Hidden name="id" value={id} />
        <div className="record-grid">
          {inspection.lines.map((l) => (
            <section className="panel operation-card" key={l.id}>
              <h2>{l.itemName}</h2>
              <p>
                Expected: {l.expectedQuantity}
                {l.baselineQuantity !== null
                  ? ` · Check-in: ${l.baselineQuantity} / ${l.baselineCondition}`
                  : ""}
              </p>
              {draft ? (
                <InspectionCount
                  line={{
                    id: l.id,
                    expectedQuantity: l.expectedQuantity,
                    actualQuantity: l.actualQuantity,
                    condition: l.condition,
                    baselineQuantity: l.baselineQuantity,
                    baselineCondition: l.baselineCondition,
                    notes: l.notes,
                  }}
                />
              ) : (
                <>
                  <p>
                    Actual: {l.actualQuantity} ·{" "}
                    {l.condition.replaceAll("_", " ")} · Difference{" "}
                    {l.actualQuantity -
                      (l.baselineQuantity ?? l.expectedQuantity)}
                  </p>
                  <span className="badge low">
                    {inspectionFlags(
                      l.expectedQuantity,
                      l.actualQuantity,
                      l.condition,
                      l.baselineQuantity,
                      l.baselineCondition,
                    ).join(", ")}
                  </span>
                  <p>{l.notes}</p>
                </>
              )}
            </section>
          ))}
        </div>
        {draft ? (
          <>
            <Field
              label="Inspection notes"
              name="notes"
              type="textarea"
              value={inspection.notes ?? ""}
            />
            <Field
              label="Save as"
              name="complete"
              options={[
                {
                  id: "false",
                  name: "Draft — continue counting / attach photos",
                },
                {
                  id: "true",
                  name: "Complete inspection (results become immutable)",
                },
              ]}
            />
          </>
        ) : (
          <p>{inspection.notes}</p>
        )}
      </StayForm>
      <h2>Evidence & associated issues</h2>
      <div className="record-grid">
        {inspection.lines.map((l) => {
          const flags = inspectionFlags(
            l.expectedQuantity,
            l.actualQuantity,
            l.condition,
            l.baselineQuantity,
            l.baselineCondition,
          );
          return (
            <section key={l.id} className="panel operation-card">
              <h2>{l.itemName}</h2>
              {l.attachments.map((a) => (
                <p key={a.id}>
                  <Link
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View protected photo
                  </Link>
                </p>
              ))}
              {draft && (
                <StayForm intent="attachment" label="Attach photo">
                  <Hidden name="inspectionLineId" value={l.id} />
                  <label>
                    Photo evidence (max 2 MB)
                    <input
                      type="file"
                      name="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      required
                    />
                  </label>
                </StayForm>
              )}
              {!draft &&
                inspection.type === "CHECK_OUT" &&
                !flags.includes("Complete") &&
                (l.damageReport ? (
                  <p>
                    Issue already associated with this inspection line.{" "}
                    <Link href="/damage">Review reports →</Link>
                  </p>
                ) : (
                  <StayForm
                    intent="inspection-issue"
                    label="Create associated issue"
                  >
                    <Hidden name="lineId" value={l.id} />
                    <Field
                      label="Issue type"
                      name="type"
                      options={[
                        "MISSING",
                        "DAMAGE",
                        "BROKEN",
                        "STAINED",
                        "LOST",
                        "FOR_REPAIR",
                        "FOR_REPLACEMENT",
                      ]}
                      value={
                        l.actualQuantity <
                        (l.baselineQuantity ?? l.expectedQuantity)
                          ? "MISSING"
                          : l.condition === "STAINED"
                            ? "STAINED"
                            : "DAMAGE"
                      }
                    />
                    <Field
                      label="Affected quantity"
                      name="quantity"
                      type="number"
                      value={Math.max(
                        1,
                        (l.baselineQuantity ?? l.expectedQuantity) -
                          l.actualQuantity,
                      )}
                      required
                    />
                    <Field
                      label="Description / association notes"
                      name="description"
                      type="textarea"
                      required
                    />
                  </StayForm>
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
