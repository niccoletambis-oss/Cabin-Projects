import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roomScope } from "@/lib/stay-operations";
import { StayForm } from "@/components/stay-form";
import { RoomFields } from "@/components/room-fields";
export default async function Rooms() {
  const user = await requireUser("rooms:view");
  const manage = can(user.role, "rooms:manage");
  const [rooms, staff] = await Promise.all([
    db.location.findMany({
      where: roomScope(user),
      include: {
        roomInventory: true,
        assignments: { include: { user: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    manage
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
        })
      : [],
  ]);
  return (
    <div className="page">
      <h1>Rooms & area inventory</h1>
      <p>
        Expected standards and physical room counts. Template edits never change
        central stock.
      </p>
      {manage && (
        <details className="panel operation-card">
          <summary>Add room / area</summary>
          <StayForm intent="room">
            <RoomFields users={staff} />
          </StayForm>
        </details>
      )}
      <div className="record-grid">
        {rooms.map((r) => (
          <Link
            key={r.id}
            className="panel operation-card"
            href={`/rooms/${r.id}`}
          >
            <span className="badge good">
              {r.type} · {r.active ? "Active" : "Archived"}
            </span>
            <h2>{r.name}</h2>
            <p>
              {r.roomInventory.length} expected items ·{" "}
              {
                r.roomInventory.filter(
                  (i) => i.assignedQuantity < i.expectedQuantity,
                ).length
              }{" "}
              shortages
            </p>
            <p>
              {
                r.roomInventory.filter(
                  (i) =>
                    i.condition === "DAMAGED" || i.condition === "FOR_REPAIR",
                ).length
              }{" "}
              damaged / for repair ·{" "}
              {r.roomInventory.filter((i) => i.condition === "MISSING").length}{" "}
              missing
            </p>
            <small>
              Staff:{" "}
              {r.assignments.map((a) => a.user.name).join(", ") || "Unassigned"}
            </small>
          </Link>
        ))}
      </div>
      {!rooms.length && (
        <p>
          No rooms are assigned to you yet. Ask a Manager to assign a room or
          area.
        </p>
      )}
    </div>
  );
}
