import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roomScope } from "@/lib/stay-operations";
import { StayForm } from "@/components/stay-form";
import { Field } from "@/components/fields";
import { LinenStatus } from "@prisma/client";
import { dateTime } from "@/lib/format";
export default async function Linen() {
  const user = await requireUser("linen");
  const manage = can(user.role, "rooms:manage");
  const locations = await db.location.findMany({
    where: { ...roomScope(user, true), active: true },
    orderBy: { name: "asc" },
  });
  const ids = locations.map((l) => l.id);
  const [balances, movements, items] = await Promise.all([
    db.linenBalance.findMany({
      where: { locationId: { in: ids } },
      include: { item: { select: { name: true, unit: true } }, location: true },
      orderBy: { item: { name: "asc" } },
    }),
    db.linenMovement.findMany({
      where: {
        newLocationId: { in: ids },
        OR: [{ previousLocationId: null }, { previousLocationId: { in: ids } }],
      },
      include: {
        item: { select: { name: true } },
        previousLocation: true,
        newLocation: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    manage
      ? db.inventoryItem.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);
  const summaries = [
    ["Available", ["AVAILABLE", "CLEAN"]],
    ["In rooms", ["ASSIGNED_TO_ROOM", "IN_USE"]],
    ["For laundry", ["USED", "FOR_LAUNDRY"]],
    ["In laundry", ["IN_LAUNDRY", "LAUNDRY"]],
    ["Damaged / stained", ["DAMAGED", "STAINED"]],
    ["Missing", ["MISSING"]],
    ["For replacement", ["FOR_REPLACEMENT"]],
  ];
  return (
    <div className="page">
      <h1>Linen & laundry</h1>
      <p>
        Move tracked linen between statuses and rooms. Every movement keeps a
        history and preserves the tracked total.
      </p>
      <div className="stats">
        {summaries.map(([label, statuses]) => (
          <section key={String(label)} className="stat-card">
            <span>{label}</span>
            <strong>
              {balances
                .filter((b) => statuses.includes(b.status))
                .reduce((n, b) => n + b.quantity, 0)}
            </strong>
          </section>
        ))}
      </div>
      <section className="panel operation-card">
        <h2>Move linen</h2>
        <StayForm intent="linen-move" label="Move quantity">
          <Field
            label="From balance"
            name="balanceId"
            options={balances
              .filter((b) => b.quantity > 0 && b.status !== "RETIRED")
              .map((b) => ({
                id: b.id,
                name: `${b.item.name} · ${b.location.name} · ${b.status} (${b.quantity})`,
              }))}
            required
          />
          <Field
            label="Quantity"
            name="quantity"
            type="number"
            value={1}
            required
          />
          <Field
            label="New status"
            name="newStatus"
            options={Object.values(LinenStatus).filter((s) => s !== "LAUNDRY")}
          />
          <Field
            label="New location"
            name="newLocationId"
            options={locations}
            required
          />
          <Field label="Movement notes" name="notes" required />
        </StayForm>
      </section>
      {manage && (
        <details className="panel operation-card">
          <summary>Register / replenish linen tracking</summary>
          <p>
            Register only physical units not already tracked. This is a status
            ledger, not an additional stock purchase; central quantities are
            unchanged.
          </p>
          <StayForm intent="linen-register">
            <Field
              label="Inventory item"
              name="itemId"
              options={items}
              required
            />
            <Field
              label="Storage / starting location"
              name="locationId"
              options={locations}
              required
            />
            <Field
              label="Quantity to register"
              name="quantity"
              type="number"
              value={1}
            />
            <Field label="Notes" name="notes" required />
          </StayForm>
        </details>
      )}
      <h2>Current balances</h2>
      <div className="record-grid">
        {balances
          .filter((b) => b.quantity > 0)
          .map((b) => (
            <section key={b.id} className="panel operation-card">
              <h2>{b.item.name}</h2>
              <p>
                {b.quantity} {b.item.unit} · {b.status.replaceAll("_", " ")}
                <br />
                {b.location.name}
              </p>
            </section>
          ))}
      </div>
      <section className="panel operation-card">
        <h2>Recent laundry / linen movements</h2>
        {movements.map((m) => (
          <p key={m.id}>
            {dateTime(m.createdAt)} · {m.user.name} · {m.item.name} ·{" "}
            {m.quantity}
            <small>
              {m.previousLocation?.name ?? "Registration"} /{" "}
              {m.previousStatus ?? "UNTRACKED"} → {m.newLocation.name} /{" "}
              {m.newStatus} · {m.notes}
            </small>
          </p>
        ))}
      </section>
    </div>
  );
}
