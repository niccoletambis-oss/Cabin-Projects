import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { roomScope } from "@/lib/stay-operations";
import { dateTime } from "@/lib/format";
export default async function Inspections() {
  const user = await requireUser("inspection");
  const inspections = await db.stayInspection.findMany({
    where: { location: roomScope(user) },
    include: {
      booking: { select: { reference: true, guestName: true } },
      location: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="page">
      <h1>Arrival & departure inspections</h1>
      <p>Start an inspection from the booking’s assigned room.</p>
      <Link className="button primary" href="/bookings">
        Open bookings
      </Link>
      <div className="record-grid">
        {inspections.map((i) => (
          <Link
            key={i.id}
            className="panel operation-card"
            href={`/inspections/${i.id}`}
          >
            <span className="badge good">
              {i.type.replaceAll("_", " ")} · {i.status}
            </span>
            <h2>{i.location.name}</h2>
            <p>
              {i.booking.reference} · {i.booking.guestName}
            </p>
            <small>
              {dateTime(i.completedAt ?? i.createdAt)} · {i.user.name}
            </small>
          </Link>
        ))}
      </div>
    </div>
  );
}
