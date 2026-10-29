export const metadata = { title: "Guest stays details | Cabin" };
import { ActionForm } from "@/components/action-form";
import { securityAction } from "@/app/security-actions";
import { EvidencePanel } from "@/components/evidence-panel";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roomScope } from "@/lib/stay-operations";
import { notFound } from "next/navigation";
import { StayForm } from "@/components/stay-form";
import { Hidden } from "@/components/fields";
import { BookingFields } from "@/components/booking-fields";
import { dateTime, money } from "@/lib/format";
export default async function Booking({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("booking:view");
  const { id } = await params;
  const b = await db.booking.findFirst({
    where: {
      id,
      ...(user.role === "CARETAKER"
        ? { rooms: { some: { location: roomScope(user) } } }
        : {}),
    },
    include: {
      rooms: {
        where: { location: roomScope(user) },
        include: { location: true },
      },
      inspections: {
        where: { location: roomScope(user) },
        include: { location: true },
        orderBy: { createdAt: "desc" },
      },
      damageReports: {
        where: user.role === "CARETAKER" ? { location: roomScope(user) } : {},
        select: { id: true, type: true, status: true, description: true },
      },
      charges: can(user.role, "finance") ? true : false,
    },
  });
  if (!b) notFound();
  const manage = can(user.role, "booking:manage");
  const rooms = manage
    ? await db.location.findMany({
        where: { type: "ROOM", active: true },
        select: { id: true, name: true },
      })
    : [];
  return (
    <div className="page">
      <h1>{b.reference}</h1>
      <p>
        {b.guestName} · {b.guestCount} guests · {b.status.replaceAll("_", " ")}
      </p>
      <p>
        Arrival {b.checkInDate.toISOString().slice(0, 10)} · Departure{" "}
        {b.checkOutDate.toISOString().slice(0, 10)}
      </p>
      {manage && (!b.privacyArchivedAt || user.role === "ADMIN") && (
        <p>
          Source {b.source} · {b.mobile || "No mobile"} ·{" "}
          {b.email || "No email"}
          <br />
          {b.notes}
        </p>
      )}
      <small>
        Checked in {b.checkedInAt ? dateTime(b.checkedInAt) : "Not yet"} ·
        Checked out {b.checkedOutAt ? dateTime(b.checkedOutAt) : "Not yet"}
      </small>
      <div className="record-grid">
        {b.rooms.map((r) => (
          <section key={r.locationId} className="panel operation-card">
            <h2>{r.location.name}</h2>
            <Link href={`/rooms/${r.locationId}`}>Room standard →</Link>
            {["UPCOMING", "CHECKED_IN"].includes(b.status) && (
              <StayForm
                intent="inspection-start"
                label="Open check-in inspection"
              >
                <Hidden name="bookingId" value={id} />
                <Hidden name="locationId" value={r.locationId} />
                <Hidden name="type" value="CHECK_IN" />
              </StayForm>
            )}
            {["CHECKED_IN", "CHECKED_OUT"].includes(b.status) && (
              <StayForm
                intent="inspection-start"
                label="Open check-out inspection"
              >
                <Hidden name="bookingId" value={id} />
                <Hidden name="locationId" value={r.locationId} />
                <Hidden name="type" value="CHECK_OUT" />
              </StayForm>
            )}
          </section>
        ))}
      </div>
      <section className="panel operation-card">
        <h2>Inspections</h2>
        {b.inspections.map((i) => (
          <p key={i.id}>
            <Link href={`/inspections/${i.id}`}>
              {i.location.name} · {i.type.replaceAll("_", " ")} · {i.status} ·{" "}
              {dateTime(i.completedAt ?? i.createdAt)}
            </Link>
          </p>
        ))}
      </section>
      <section className="panel operation-card">
        <h2>Issues associated with booking</h2>
        <p>
          An association does not establish guest responsibility. Management
          review is required.
        </p>
        {b.damageReports.map((r) => (
          <p key={r.id}>
            <Link href="/damage">
              {r.type} · {r.status} · {r.description}
            </Link>
          </p>
        ))}
      </section>
      {manage && (
        <section className="panel operation-card">
          <h2>Guest charges</h2>
          {b.charges.map((c) => (
            <p key={c.id}>
              <Link href={`/charges/${c.id}`}>
                {c.reference} · {c.status} · {money(Number(c.amount))}
              </Link>
            </p>
          ))}
        </section>
      )}
      {manage && b.status === "UPCOMING" && (
        <>
          <details className="panel operation-card">
            <summary>Edit upcoming booking (before inspection)</summary>
            <StayForm intent="booking">
              <Hidden name="id" value={id} />
              <BookingFields rooms={rooms} booking={b} />
            </StayForm>
          </details>
          <StayForm intent="booking-cancel" label="Cancel upcoming booking">
            <Hidden name="id" value={id} />
          </StayForm>
        </>
      )}
      {b.privacyArchivedAt && (
        <p>Contact details archived. Historical records retained.</p>
      )}
      {user.role === "ADMIN" &&
        ["CHECKED_OUT", "CANCELLED"].includes(b.status) && (
          <section className="panel operation-card">
            <h2>Guest privacy</h2>
            <p>
              {b.legalHold ? "Legal hold active." : "No legal hold."} Archiving
              restricts contact visibility; it retains original records.
            </p>
            {[
              b.privacyArchivedAt ? "restore" : "archive",
              b.legalHold ? "release" : "hold",
            ].map((action) => (
              <ActionForm
                key={action}
                intent="booking-privacy"
                handler={securityAction}
                label={action + " privacy status"}
              >
                <Hidden name="id" value={id} />
                <Hidden name="privacyAction" value={action} />
                <label>
                  Confirm your password
                  <input
                    type="password"
                    name="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
              </ActionForm>
            ))}
          </section>
        )}
      <EvidencePanel parent={{ bookingId: id }} />
    </div>
  );
}
