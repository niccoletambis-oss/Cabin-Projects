export const metadata = { title: "Record details | Cabin" };
import { EvidencePanel } from "@/components/evidence-panel";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { assertRoom } from "@/lib/stay-operations";
import { notFound } from "next/navigation";
import { StayForm } from "@/components/stay-form";
import { RoomFields } from "@/components/room-fields";
import { Field, Hidden } from "@/components/fields";
import { ItemCondition } from "@prisma/client";
import { money } from "@/lib/format";
export default async function Room({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("rooms:view");
  const { id } = await params;
  try {
    await assertRoom(user, id);
  } catch {
    notFound();
  }
  const room = await db.location.findUniqueOrThrow({
    where: { id },
    include: {
      assignments: true,
      roomInventory: {
        include: { item: true },
        orderBy: { item: { name: "asc" } },
      },
    },
  });
  const manage = can(user.role, "rooms:manage");
  const [staff, items] = manage
    ? await Promise.all([
        db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
        }),
        db.inventoryItem.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []];
  return (
    <div className="page">
      <h1>{room.name}</h1>
      <p>
        {room.description} · {room.type} · {room.active ? "Active" : "Archived"}
      </p>
      {manage && (
        <details className="panel operation-card">
          <summary>Edit room / staff assignments</summary>
          <StayForm intent="room">
            <Hidden name="id" value={id} />
            <RoomFields room={room} users={staff} />
          </StayForm>
        </details>
      )}
      <div className="record-grid">
        {room.roomInventory.map((line) => (
          <section key={line.id} className="panel operation-card">
            <h2>{line.item.name}</h2>
            <p>
              Expected {line.expectedQuantity} · Assigned / last inspected{" "}
              {line.assignedQuantity} · Difference{" "}
              {line.assignedQuantity - line.expectedQuantity}
            </p>
            <span className="badge low">
              {line.condition.replaceAll("_", " ")}
              {line.assignedQuantity < line.expectedQuantity
                ? " · SHORTAGE"
                : ""}
            </span>
            {manage && (
              <p>Replacement cost {money(Number(line.replacementCost))}</p>
            )}
            <p>{line.notes}</p>
            {manage && (
              <details>
                <summary>Edit template line</summary>
                <StayForm intent="room-line">
                  <Hidden name="locationId" value={id} />
                  <Hidden name="itemId" value={line.itemId} />
                  <Field
                    label="Expected quantity"
                    name="expectedQuantity"
                    type="number"
                    value={line.expectedQuantity}
                  />
                  <Field
                    label="Current assigned quantity"
                    name="assignedQuantity"
                    type="number"
                    value={line.assignedQuantity}
                  />
                  <Field
                    label="Condition"
                    name="condition"
                    value={line.condition}
                    options={Object.values(ItemCondition)}
                  />
                  <Field
                    label="Replacement cost (PHP)"
                    name="replacementCost"
                    type="number"
                    value={Number(line.replacementCost)}
                  />
                  <Field label="Notes" name="notes" value={line.notes ?? ""} />
                </StayForm>
              </details>
            )}
          </section>
        ))}
      </div>
      {manage && (
        <section className="panel operation-card">
          <h2>Add expected inventory</h2>
          <StayForm intent="room-line">
            <Hidden name="locationId" value={id} />
            <Field label="Item" name="itemId" options={items} required />
            <Field
              label="Expected quantity"
              name="expectedQuantity"
              type="number"
              value={1}
            />
            <Field
              label="Assigned quantity"
              name="assignedQuantity"
              type="number"
              value={1}
            />
            <Field
              label="Condition"
              name="condition"
              options={Object.values(ItemCondition)}
              value="GOOD"
            />
            <Field
              label="Replacement cost (PHP)"
              name="replacementCost"
              type="number"
              value={0}
            />
            <Field label="Notes" name="notes" type="textarea" />
          </StayForm>
        </section>
      )}
      <EvidencePanel parent={{ locationId: id }} />
    </div>
  );
}
