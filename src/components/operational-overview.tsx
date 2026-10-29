import { expenseSummary } from "@/lib/expense-summary";
import Link from "next/link";
import { db } from "@/lib/db";
import { can, type Actor } from "@/lib/permissions";
import { roomScope } from "@/lib/stay-operations";
import { manilaDay } from "@/lib/stay-status";
import { money, dateTime } from "@/lib/format";
export async function OperationalOverview({
  actor,
  pendingReportCount,
}: {
  actor: Actor;
  pendingReportCount: number;
}) {
  const financial = can(actor.role, "finance");
  const summary = await expenseSummary(actor);
  const today = new Date(`${manilaDay()}T00:00:00Z`);
  const locations = await db.location.findMany({
    where: roomScope(actor, true),
    select: { id: true },
  });
  const ids = locations.map((l) => l.id);
  const [stays, linen, inspections, issues, charges, expenses] =
    await Promise.all([
      db.booking.findMany({
        where: {
          OR: [
            { status: { in: ["UPCOMING", "CHECKED_IN"] } },
            { status: "CHECKED_OUT", checkOutDate: today },
          ],
          ...(actor.role === "CARETAKER"
            ? { rooms: { some: { location: roomScope(actor) } } }
            : {}),
        },
        include: {
          rooms: {
            where: { location: roomScope(actor) },
            include: { location: { select: { name: true } } },
          },
          inspections: {
            select: { locationId: true, type: true, status: true },
          },
        },
        orderBy: { checkInDate: "asc" },
      }),
      db.linenBalance.findMany({
        where: { locationId: { in: ids } },
        select: { status: true, quantity: true },
      }),
      db.stayInspection.findMany({
        where: { location: roomScope(actor) },
        include: {
          location: { select: { name: true } },
          booking: { select: { reference: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.damageReport.findMany({
        where: {
          status: {
            in: ["PENDING", "UNDER_REVIEW", "FOR_REPAIR", "FOR_REPLACEMENT"],
          },
          ...(actor.role === "CARETAKER"
            ? {
                OR: [
                  { bookingId: null },
                  { location: { assignments: { some: { userId: actor.id } } } },
                ],
              }
            : {}),
        },
        include: { item: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      financial
        ? db.guestCharge.count({
            where: { status: { in: ["DRAFT", "FOR_REVIEW"] } },
          })
        : 0,
      db.expense.findMany({
        where: {
          incurredAt: {
            gte: new Date(`${manilaDay().slice(0, 7)}-01T00:00:00+08:00`),
          },
          ...(financial ? {} : { recordedById: actor.id }),
        },
        select: {
          id: true,
          description: true,
          amount: true,
          status: true,
          incurredAt: true,
        },
        orderBy: { incurredAt: "desc" },
        take: 5,
      }),
    ]);
  const due = stays.filter(
    (b) => b.status === "CHECKED_IN" && b.checkOutDate <= today,
  );
  const pending = due.reduce(
    (n, b) =>
      n +
      b.rooms.filter(
        (r) =>
          !b.inspections.some(
            (i) =>
              i.locationId === r.locationId &&
              i.type === "CHECK_OUT" &&
              i.status === "COMPLETED",
          ),
      ).length,
    0,
  );
  const total = (statuses: string[]) =>
    linen
      .filter((l) => statuses.includes(l.status))
      .reduce((n, l) => n + l.quantity, 0);
  const cards = [
    ["Upcoming check-ins", stays.filter((b) => b.status === "UPCOMING").length],
    [
      "Guests checked in",
      stays
        .filter((b) => b.status === "CHECKED_IN")
        .reduce((n, b) => n + b.guestCount, 0),
    ],
    [
      "Check-outs today",
      stays.filter((b) => b.checkOutDate.getTime() === today.getTime()).length,
    ],
    ["Pending check-out inspections", pending],
    ["Linen for laundry", total(["USED", "FOR_LAUNDRY"])],
    ["Linen in laundry", total(["IN_LAUNDRY", "LAUNDRY"])],
    ["Pending damage reviews", pendingReportCount],
  ];
  if (financial)
    cards.push(
      ["Pending guest charges", charges],
      ["Monthly approved expenses", money(summary.approved)],
    );
  return (
    <section className="operations-overview">
      <h2>Today’s operations · {manilaDay()}</h2>
      <div className="operation-quick-links">
        <Link className="button primary" href="/bookings">
          Check-in inspection
        </Link>
        <Link className="button" href="/bookings">
          Check-out inspection
        </Link>
        <Link className="button" href="/damage?type=DAMAGE">
          Report damage
        </Link>
        <Link className="button" href="/damage?type=MISSING">
          Report missing
        </Link>
        <Link className="button" href="/linen">
          Move linen
        </Link>
        <Link className="button" href="/inventory">
          Stock In / Out
        </Link>
        <Link className="button" href="/audits">
          Inventory audit
        </Link>
        <Link className="button" href="/expenses/new">
          Add expense
        </Link>
      </div>
      <div className="stats">
        {cards.map(([label, value]) => (
          <section key={String(label)} className="stat-card">
            <span>{label}</span>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel operation-card">
          <h2>Arrivals & departures</h2>
          {stays
            .filter((b) => b.checkInDate <= today || b.checkOutDate <= today)
            .slice(0, 6)
            .map((b) => (
              <p key={b.id}>
                <Link href={`/bookings/${b.id}`}>
                  {b.reference} · {b.guestName} ·{" "}
                  {b.status.replaceAll("_", " ")}
                </Link>
                <small>{b.rooms.map((r) => r.location.name).join(", ")}</small>
              </p>
            ))}
          <h2>Recent inspections</h2>
          {!inspections.length && (
            <p>No room checks yet. Open a guest stay to begin.</p>
          )}
          {inspections.map((i) => (
            <p key={i.id}>
              <Link href={`/inspections/${i.id}`}>
                {i.location.name} · {i.type.replaceAll("_", " ")} · {i.status}
              </Link>
              <small>
                {i.booking.reference} · {dateTime(i.completedAt ?? i.createdAt)}
              </small>
            </p>
          ))}
        </section>
        <section className="panel operation-card">
          <h2>Linen status</h2>
          <p>
            Available / clean: {total(["AVAILABLE", "CLEAN"])}
            <br />
            In rooms / use: {total(["ASSIGNED_TO_ROOM", "IN_USE"])}
            <br />
            Missing: {total(["MISSING"])}
            <br />
            For replacement: {total(["FOR_REPLACEMENT"])}
          </p>
          <h2>Pending issues</h2>
          {!issues.length && (
            <p>No pending issues. Thank you for looking after the cabin.</p>
          )}
          {issues.map((i) => (
            <p key={i.id}>
              <Link href="/damage">
                {i.item.name} · {i.type} · {i.status.replaceAll("_", " ")}
              </Link>
            </p>
          ))}
        </section>
      </div>
      <section className="panel operation-card">
        <h2>
          {financial ? "Recent expenses" : "My recent expense submissions"}
        </h2>
        {!expenses.length && <p>No expense submissions this month.</p>}
        {expenses.slice(0, 5).map((e) => (
          <p key={e.id}>
            <Link href={`/expenses/${e.id}`}>
              {e.description} · {money(Number(e.amount))} · {e.status}
            </Link>
          </p>
        ))}
      </section>
    </section>
  );
}
