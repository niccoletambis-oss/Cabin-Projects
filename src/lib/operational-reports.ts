import { db } from "./db";
import { authorize, type Actor } from "./permissions";
import { z } from "zod";
import { StayError } from "./stay-operations";
import { manilaDay, inspectionFlags } from "./stay-status";
import { stockLevel } from "./inventory-status";
export const reportKinds = [
  "room-inventory",
  "room-discrepancies",
  "linen-status",
  "laundry-movements",
  "check-in-inspections",
  "check-out-inspections",
  "damage-missing",
  "guest-charges",
  "expenses",
  "monthly-expenses",
  "inventory-valuation",
  "low-stock",
  "purchases",
  "audits",
] as const;
export type ReportKind = (typeof reportKinds)[number];
const filter = z.string().trim().max(100).optional().default("");
const dateFilter = z
  .string()
  .optional()
  .default("")
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Use a valid YYYY-MM-DD date",
  );
export const reportQuery = z
  .object({
    type: z.enum(reportKinds).default("room-inventory"),
    from: dateFilter,
    to: dateFilter,
    locationId: filter,
    categoryId: filter,
    itemId: filter,
    bookingId: filter,
    status: filter,
    supplierId: filter,
    userId: filter,
  })
  .refine(
    (q) => !q.from || !q.to || q.to >= q.from,
    "End date must follow start date",
  );
export type ReportQuery = z.infer<typeof reportQuery>;
type Value = string | number;
type Row = {
  values: Value[];
  date?: Date;
  locationId?: string | null;
  locationIds?: string[];
  categoryId?: string | null;
  itemId?: string | null;
  bookingId?: string | null;
  status?: string;
  supplierId?: string | null;
  userId?: string | null;
  amount?: number;
};
const limit = 5001;
export async function operationalReport(actor: Actor, input: unknown) {
  authorize(actor, "reports");
  const q = reportQuery.parse(input);
  const start = q.from ? new Date(`${q.from}T00:00:00+08:00`) : undefined;
  const end = q.to
    ? new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 86400000)
    : undefined;
  const range =
    start || end
      ? { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) }
      : undefined;
  let columns: string[] = [];
  let rows: Row[] = [];
  if (q.type === "room-inventory" || q.type === "room-discrepancies") {
    const data = await db.roomInventory.findMany({
      where: {
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.itemId ? { itemId: q.itemId } : {}),
        ...(range ? { updatedAt: range } : {}),
      },
      include: { location: true, item: true },
      take: limit,
    });
    if (data.length >= limit)
      throw new StayError(
        "Report exceeds 5,000 rows. Narrow the date, room or item filters.",
      );
    columns = [
      "Room / Area",
      "Item",
      "Expected",
      "Assigned / last inspected",
      "Difference",
      "Condition",
      "Replacement cost PHP",
      "Notes",
    ];
    rows = data
      .filter(
        (l) =>
          q.type !== "room-discrepancies" ||
          l.assignedQuantity !== l.expectedQuantity ||
          ["DAMAGED", "MISSING", "FOR_REPAIR", "FOR_REPLACEMENT"].includes(
            l.condition,
          ),
      )
      .map((l) => ({
        values: [
          l.location.name,
          l.item.name,
          l.expectedQuantity,
          l.assignedQuantity,
          l.assignedQuantity - l.expectedQuantity,
          l.condition,
          Number(l.replacementCost),
          l.notes ?? "",
        ],
        date: l.updatedAt,
        locationId: l.locationId,
        itemId: l.itemId,
        categoryId: l.item.categoryId,
        supplierId: l.item.supplierId,
        status:
          l.condition === "MISSING"
            ? "MISSING"
            : l.condition === "DAMAGED"
              ? "DAMAGED"
              : l.assignedQuantity < l.expectedQuantity
                ? "SHORTAGE"
                : l.assignedQuantity > l.expectedQuantity
                  ? "EXCESS"
                  : "NORMAL",
      }));
  } else if (q.type === "linen-status") {
    const data = await db.linenBalance.findMany({
      where: {
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.itemId ? { itemId: q.itemId } : {}),
      },
      include: { location: true, item: true },
      take: limit,
    });
    columns = ["Item", "Location", "Status", "Quantity"];
    rows = data.map((l) => ({
      values: [l.item.name, l.location.name, l.status, l.quantity],
      locationId: l.locationId,
      itemId: l.itemId,
      categoryId: l.item.categoryId,
      supplierId: l.item.supplierId,
      status: l.status,
    }));
  } else if (q.type === "laundry-movements") {
    const data = await db.linenMovement.findMany({
      where: {
        ...(range ? { createdAt: range } : {}),
        ...(q.locationId
          ? {
              OR: [
                { previousLocationId: q.locationId },
                { newLocationId: q.locationId },
              ],
            }
          : {}),
        ...(q.itemId ? { itemId: q.itemId } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
      },
      include: {
        item: true,
        previousLocation: true,
        newLocation: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    columns = [
      "Date",
      "Item",
      "Quantity",
      "Previous status",
      "New status",
      "Previous location",
      "New location",
      "User",
      "Notes",
    ];
    rows = data.map((l) => ({
      values: [
        l.createdAt.toISOString(),
        l.item.name,
        l.quantity,
        l.previousStatus ?? "UNTRACKED",
        l.newStatus,
        l.previousLocation?.name ?? "Registration",
        l.newLocation.name,
        l.user.name,
        l.notes,
      ],
      date: l.createdAt,
      locationId: l.newLocationId,
      locationIds: [l.previousLocationId, l.newLocationId].filter(
        (v): v is string => v !== null,
      ),
      itemId: l.itemId,
      categoryId: l.item.categoryId,
      supplierId: l.item.supplierId,
      status: l.newStatus,
      userId: l.userId,
    }));
  } else if (
    q.type === "check-in-inspections" ||
    q.type === "check-out-inspections"
  ) {
    const data = await db.stayInspectionLine.findMany({
      where: {
        ...(q.itemId ? { itemId: q.itemId } : {}),
        inspection: {
          type: q.type === "check-in-inspections" ? "CHECK_IN" : "CHECK_OUT",
          ...(range ? { createdAt: range } : {}),
          ...(q.locationId ? { locationId: q.locationId } : {}),
          ...(q.bookingId ? { bookingId: q.bookingId } : {}),
        },
      },
      include: {
        item: true,
        inspection: {
          include: {
            location: true,
            booking: { select: { reference: true } },
            user: { select: { name: true } },
          },
        },
      },
      take: limit,
    });
    columns = [
      "Date",
      "Booking",
      "Room",
      "Item",
      "Expected",
      "Check-in quantity",
      "Check-in condition",
      "Actual",
      "Condition",
      "Difference",
      "Flags",
      "User",
      "Inspection status",
      "Notes",
    ];
    rows = data.map((l) => ({
      values: [
        l.inspection.createdAt.toISOString(),
        l.inspection.booking.reference,
        l.inspection.location.name,
        l.itemName,
        l.expectedQuantity,
        l.baselineQuantity ?? "",
        l.baselineCondition ?? "",
        l.actualQuantity,
        l.condition,
        l.actualQuantity - (l.baselineQuantity ?? l.expectedQuantity),
        inspectionFlags(
          l.expectedQuantity,
          l.actualQuantity,
          l.condition,
          l.baselineQuantity,
          l.baselineCondition,
        ).join("; "),
        l.inspection.user.name,
        l.inspection.status,
        l.notes ?? "",
      ],
      date: l.inspection.createdAt,
      locationId: l.inspection.locationId,
      itemId: l.itemId,
      categoryId: l.item.categoryId,
      supplierId: l.item.supplierId,
      status: l.inspection.status,
      bookingId: l.inspection.bookingId,
      userId: l.inspection.userId,
    }));
  } else if (q.type === "damage-missing") {
    const data = await db.damageReport.findMany({
      where: {
        ...(range ? { createdAt: range } : {}),
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.bookingId ? { bookingId: q.bookingId } : {}),
      },
      include: {
        item: true,
        location: true,
        booking: { select: { reference: true } },
        user: { select: { name: true } },
      },
      take: limit,
    });
    columns = [
      "Date",
      "Associated booking",
      "Room",
      "Item",
      "Type",
      "Quantity",
      "Status",
      "Estimated replacement PHP",
      "Description",
      "Reported by",
    ];
    rows = data.map((r) => ({
      values: [
        r.createdAt.toISOString(),
        r.booking?.reference ?? "Standalone",
        r.location?.name ?? "",
        r.item.name,
        r.type,
        r.quantity,
        r.status,
        Number(r.estimatedCost ?? 0),
        r.description,
        r.user?.name ?? "Legacy",
      ],
      date: r.createdAt,
      locationId: r.locationId,
      itemId: r.itemId,
      categoryId: r.item.categoryId,
      supplierId: r.item.supplierId,
      bookingId: r.bookingId,
      status: r.status,
      userId: r.userId,
    }));
  } else if (q.type === "guest-charges") {
    const data = await db.guestCharge.findMany({
      where: {
        ...(range ? { createdAt: range } : {}),
        ...(q.bookingId ? { bookingId: q.bookingId } : {}),
      },
      include: {
        booking: { select: { reference: true } },
        damageReport: { include: { item: true } },
        createdBy: { select: { name: true } },
      },
      take: limit,
    });
    columns = [
      "Date",
      "Reference",
      "Booking",
      "Item",
      "Quantity",
      "Replacement PHP",
      "Charge PHP",
      "Status",
      "Payment status",
      "Approved at",
      "Paid at",
      "Reason",
    ];
    rows = data.map((c) => ({
      values: [
        c.createdAt.toISOString(),
        c.reference,
        c.booking.reference,
        c.damageReport.item.name,
        c.quantity,
        Number(c.replacementCost),
        Number(c.amount),
        c.status,
        c.paymentStatus,
        c.approvedAt?.toISOString() ?? "",
        c.paidAt?.toISOString() ?? "",
        c.reason,
      ],
      date: c.createdAt,
      bookingId: c.bookingId,
      locationId: c.damageReport.locationId,
      itemId: c.damageReport.itemId,
      categoryId: c.damageReport.item.categoryId,
      supplierId: c.damageReport.item.supplierId,
      status: c.status,
      userId: c.createdById,
    }));
  } else if (q.type === "expenses" || q.type === "monthly-expenses") {
    const data = await db.expense.findMany({
      where: {
        ...(range ? { incurredAt: range } : {}),
        ...(q.bookingId ? { bookingId: q.bookingId } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.userId ? { recordedById: q.userId } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        booking: {
          select: { reference: true, rooms: { select: { locationId: true } } },
        },
        recordedBy: { select: { name: true } },
        purchase: { select: { reference: true } },
        damageReport: { select: { locationId: true, itemId: true } },
      },
      orderBy: { incurredAt: "desc" },
      take: limit,
    });
    columns = [
      "Date",
      "Expense number",
      "Category",
      "Description",
      "Payee / Supplier",
      "Amount PHP",
      "Method",
      "Receipt number",
      "Booking",
      "Purchase",
      "Status",
      "Recorded by",
      "Notes",
    ];
    rows = data.map((e) => ({
      values: [
        e.incurredAt.toISOString(),
        e.reference ?? e.id,
        e.category,
        e.description,
        e.supplier?.name ?? e.payee ?? "",
        Number(e.amount),
        e.paymentMethod,
        e.receiptNumber ?? "",
        e.booking?.reference ?? "",
        e.purchase?.reference ?? "",
        e.status,
        e.recordedBy?.name ?? "Legacy",
        e.notes ?? "",
      ],
      date: e.incurredAt,
      categoryId: e.category,
      bookingId: e.bookingId,
      supplierId: e.supplierId,
      userId: e.recordedById,
      status: e.status,
      locationId: e.damageReport?.locationId,
      locationIds: e.booking?.rooms.map((r) => r.locationId) ?? [],
      itemId: e.damageReport?.itemId,
      amount: Number(e.amount),
    }));
  } else if (q.type === "inventory-valuation" || q.type === "low-stock") {
    const data = await db.inventoryItem.findMany({
      where: {
        ...(q.itemId ? { id: q.itemId } : {}),
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      },
      include: {
        category: true,
        location: true,
        supplier: { select: { name: true } },
      },
      take: limit,
    });
    if (data.length >= limit)
      throw new StayError(
        "Report exceeds 5,000 rows. Narrow the date, room or item filters.",
      );
    columns = [
      "Item",
      "SKU",
      "Category",
      "Location",
      "Quantity",
      "Minimum",
      "Reorder quantity",
      "Status",
      "Unit cost PHP",
      "Value PHP",
      "Supplier",
    ];
    rows = data
      .filter(
        (i) =>
          q.type !== "low-stock" ||
          (i.status === "ACTIVE" && i.quantity <= i.minimumStock),
      )
      .map((i) => ({
        values: [
          i.name,
          i.sku,
          i.category.name,
          i.location.name,
          i.quantity,
          i.minimumStock,
          i.reorderQuantity,
          stockLevel(i.quantity, i.minimumStock),
          Number(i.unitCost),
          Number(i.unitCost.times(i.quantity).toFixed(2)),
          i.supplier?.name ?? "",
        ],
        itemId: i.id,
        locationId: i.locationId,
        categoryId: i.categoryId,
        supplierId: i.supplierId,
        status: stockLevel(i.quantity, i.minimumStock).replaceAll(" ", "_"),
      }));
  } else if (q.type === "purchases") {
    const data = await db.purchaseLine.findMany({
      where: {
        ...(q.itemId ? { itemId: q.itemId } : {}),
        purchase: {
          ...(range ? { purchasedAt: range } : {}),
          ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        },
      },
      include: {
        item: true,
        purchase: {
          include: {
            supplier: { select: { name: true } },
            requestedBy: { select: { name: true } },
          },
        },
      },
      take: limit,
    });
    columns = [
      "Date",
      "Request",
      "Supplier",
      "Item",
      "Quantity",
      "Unit cost PHP",
      "Total PHP",
      "Status",
      "Requested by",
      "Received at",
    ];
    rows = data.map((l) => ({
      values: [
        l.purchase.purchasedAt.toISOString(),
        l.purchase.reference,
        l.purchase.supplier.name,
        l.item.name,
        l.quantity,
        Number(l.unitCost),
        Number(l.unitCost.times(l.quantity).toFixed(2)),
        l.purchase.status,
        l.purchase.requestedBy?.name ?? "Legacy",
        l.purchase.receivedAt?.toISOString() ?? "",
      ],
      date: l.purchase.purchasedAt,
      itemId: l.itemId,
      locationId: l.item.locationId,
      categoryId: l.item.categoryId,
      supplierId: l.purchase.supplierId,
      userId: l.purchase.requestedById,
      status: l.purchase.status,
    }));
  } else {
    const data = await db.auditLine.findMany({
      where: {
        ...(q.itemId ? { itemId: q.itemId } : {}),
        audit: {
          ...(range ? { createdAt: range } : {}),
          ...(q.locationId ? { locationId: q.locationId } : {}),
        },
      },
      include: {
        item: true,
        audit: {
          include: {
            location: { select: { name: true } },
            user: { select: { name: true } },
          },
        },
      },
      take: limit,
    });
    columns = [
      "Date",
      "Audit",
      "Location",
      "Item",
      "Expected",
      "Counted",
      "Difference",
      "Condition",
      "Status",
      "Performed by",
      "Remarks",
    ];
    rows = data.map((l) => ({
      values: [
        l.audit.createdAt.toISOString(),
        l.audit.id,
        l.audit.location?.name ?? "Whole property",
        l.item.name,
        l.expectedQuantity,
        l.countedQuantity,
        l.countedQuantity - l.expectedQuantity,
        l.condition,
        l.audit.status,
        l.audit.user?.name ?? "Legacy",
        l.remarks ?? "",
      ],
      date: l.audit.createdAt,
      locationId: l.audit.locationId ?? l.item.locationId,
      itemId: l.itemId,
      categoryId: l.item.categoryId,
      supplierId: l.item.supplierId,
      userId: l.audit.userId,
      status: l.audit.status,
    }));
  }
  if (rows.length >= limit)
    throw new StayError(
      "Report exceeds 5,000 rows. Narrow the date, room or item filters.",
    );
  rows = rows.filter(
    (r) =>
      (!q.from || !r.date || r.date >= start!) &&
      (!q.to || !r.date || r.date < end!) &&
      (!q.locationId ||
        r.locationId === q.locationId ||
        r.locationIds?.includes(q.locationId)) &&
      (!q.categoryId || r.categoryId === q.categoryId) &&
      (!q.itemId || r.itemId === q.itemId) &&
      (!q.bookingId || r.bookingId === q.bookingId) &&
      (!q.supplierId || r.supplierId === q.supplierId) &&
      (!q.userId || r.userId === q.userId) &&
      (!q.status || r.status === q.status.toUpperCase().replaceAll(" ", "_")),
  );
  if (q.type === "monthly-expenses") {
    const groups = new Map<
      string,
      { approved: number; submitted: number; rejected: number; count: number }
    >();
    for (const r of rows) {
      const month = manilaDay(r.date!).slice(0, 7);
      const group = groups.get(month) ?? {
        approved: 0,
        submitted: 0,
        rejected: 0,
        count: 0,
      };
      group.count++;
      if (r.status === "APPROVED") group.approved += r.amount!;
      else if (r.status === "SUBMITTED") group.submitted += r.amount!;
      else group.rejected += r.amount!;
      groups.set(month, group);
    }
    columns = [
      "Month (Asia/Manila)",
      "Approved PHP",
      "Submitted PHP",
      "Rejected PHP",
      "Records",
    ];
    return {
      query: q,
      columns,
      rows: [...groups.entries()]
        .sort()
        .map(
          ([month, g]) =>
            [
              month,
              Number(g.approved.toFixed(2)),
              Number(g.submitted.toFixed(2)),
              Number(g.rejected.toFixed(2)),
              g.count,
            ] as Value[],
        ),
    };
  }
  return { query: q, columns, rows: rows.map((r) => r.values) };
}
export function csvCell(value: Value) {
  let cell = String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(cell))
    cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}
export function reportCsv(columns: string[], rows: Value[][], excel = false) {
  return (
    (excel ? "\uFEFF" : "") +
    [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
