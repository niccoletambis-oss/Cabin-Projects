import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roomScope } from "@/lib/stay-operations";
export default async function Bookings() {
  const user = await requireUser("booking:view");
  const bookings = await db.booking.findMany({
    where:
      user.role === "CARETAKER"
        ? { rooms: { some: { location: roomScope(user) } } }
        : {},
    include: {
      rooms: {
        where: { location: roomScope(user) },
        include: { location: true },
      },
    },
    orderBy: { checkInDate: "desc" },
  });
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Guest stays</h1>
          <p>
            Booking references connect room checks, associated issues and
            reviewed charges.
          </p>
        </div>
        {can(user.role, "booking:manage") && (
          <Link className="button primary" href="/bookings/new">
            Add booking
          </Link>
        )}
      </div>
      <div className="record-grid">
        {bookings.map((b) => (
          <Link
            key={b.id}
            className="panel operation-card"
            href={`/bookings/${b.id}`}
          >
            <span className="badge good">{b.status.replaceAll("_", " ")}</span>
            <h2>{b.reference}</h2>
            <p>
              {b.guestName} · {b.guestCount} guests
            </p>
            <p>
              {b.checkInDate.toISOString().slice(0, 10)} →{" "}
              {b.checkOutDate.toISOString().slice(0, 10)}
            </p>
            <small>{b.rooms.map((r) => r.location.name).join(", ")}</small>
          </Link>
        ))}
      </div>
      {!bookings.length && <p>No accessible bookings yet.</p>}
    </div>
  );
}
