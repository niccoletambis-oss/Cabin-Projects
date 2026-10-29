export const metadata = { title: "Room inspections | Cabin" };
import { Pagination } from "@/components/pagination";
import { pageNumber, pageQuery, PAGE_SIZE } from "@/lib/pagination";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { roomScope } from "@/lib/stay-operations";
import { dateTime } from "@/lib/format";
export default async function Inspections({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const user = await requireUser("inspection");
  const inspections = await db.stayInspection.findMany({
    where: { location: roomScope(user) },
    include: {
      booking: { select: { reference: true, guestName: true } },
      location: true,
      user: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageQuery(page),
  });
  return (
    <div className="page">
      <h1>Arrival & departure inspections</h1>
      <p>Start an inspection from the booking’s assigned room.</p>
      <Link className="button primary" href="/bookings">
        Open bookings
      </Link>
      <div className="record-grid">
        {inspections.slice(0, PAGE_SIZE).map((i) => (
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
      {!inspections.length && (
        <p className="empty-state">
          No records on this page. New records will appear here.
        </p>
      )}
      <Pagination page={page} hasNext={inspections.length > PAGE_SIZE} />
    </div>
  );
}
