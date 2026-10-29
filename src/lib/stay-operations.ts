import { stageFile, readyFile, discardFile } from "./storage/service";
import { db } from "./db";
import { authorize, type Actor } from "./permissions";
import { z } from "zod";
import {
  ItemCondition,
  LocationType,
  LinenStatus,
  BookingSource,
  ReportType,
  ExpenseCategory,
  PaymentMethod,
  StayCondition,
  Prisma,
} from "@prisma/client";
import { manilaDay, inspectionFlags } from "./stay-status";
export class StayError extends Error {}
function fail(message: string): never {
  throw new StayError(message);
}
const count = z.coerce.number().int().min(0).max(1_000_000);
const positive = count.refine((v) => v > 0, "Enter a positive whole quantity");
const money = z.coerce
  .number()
  .min(0)
  .max(1_000_000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
    "Use at most two decimal places",
  );
const text = z.string().trim().max(2000);
const name = z.string().trim().min(2).max(120);
const id = z.string().min(1).max(100);
const optionalId = z.string().max(100).nullable().optional();
const stamp = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
type Tx = Prisma.TransactionClient;
export const stayLog = (
  tx: Tx,
  actor: Actor,
  action: string,
  entityId: string,
  details: string,
) =>
  tx.activityLog.create({
    data: { userId: actor.id, role: actor.role, action, entityId, details },
  });
export async function assertRoom(
  actor: Actor,
  locationId: string,
  tx: Tx = db,
  shared = false,
) {
  authorize(actor, "rooms:view");
  const location = await tx.location.findUniqueOrThrow({
    where: { id: locationId },
  });
  if (
    actor.role === "CARETAKER" &&
    !(shared && ["STORAGE", "LAUNDRY"].includes(location.type)) &&
    !(await tx.locationAssignment.findUnique({
      where: { locationId_userId: { locationId, userId: actor.id } },
    }))
  )
    fail("This room or area is not assigned to you.");
  return location;
}
export function roomScope(
  actor: Actor,
  shared = false,
): Prisma.LocationWhereInput {
  return actor.role === "CARETAKER"
    ? {
        active: true,
        OR: [
          { assignments: { some: { userId: actor.id } } },
          ...(shared
            ? [{ type: { in: ["STORAGE", "LAUNDRY"] as LocationType[] } }]
            : []),
        ],
      }
    : {};
}
export async function saveRoom(actor: Actor, input: unknown) {
  authorize(actor, "rooms:manage");
  const data = z
    .object({
      id: optionalId,
      name,
      description: text,
      type: z.nativeEnum(LocationType),
      active: z.boolean(),
      assignees: z.array(id).max(100),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const { id: roomId, assignees, ...fields } = data;
    if (
      roomId &&
      !fields.active &&
      (await tx.bookingRoom.count({
        where: {
          locationId: roomId,
          booking: { status: { in: ["UPCOMING", "CHECKED_IN"] } },
        },
      }))
    )
      fail("Cancel or complete active stays before archiving this room.");
    if (
      (await tx.user.count({
        where: { id: { in: [...new Set(assignees)] }, active: true },
      })) !== new Set(assignees).size
    )
      fail("Select active staff members.");
    const before = roomId
      ? await tx.location.findUniqueOrThrow({
          where: { id: roomId },
          include: { assignments: true },
        })
      : null;
    const room = roomId
      ? await tx.location.update({ where: { id: roomId }, data: fields })
      : await tx.location.create({ data: fields });
    await tx.locationAssignment.deleteMany({ where: { locationId: room.id } });
    if (assignees.length)
      await tx.locationAssignment.createMany({
        data: [...new Set(assignees)].map((userId) => ({
          locationId: room.id,
          userId,
        })),
      });
    await stayLog(
      tx,
      actor,
      "ROOM_UPDATED",
      room.id,
      JSON.stringify({ before, after: { ...fields, assignees } }),
    );
    return room;
  });
}
export async function saveRoomLine(actor: Actor, input: unknown) {
  authorize(actor, "rooms:manage");
  const data = z
    .object({
      locationId: id,
      itemId: id,
      expectedQuantity: count,
      assignedQuantity: count,
      condition: z.nativeEnum(ItemCondition),
      replacementCost: money,
      notes: text,
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const before = await tx.roomInventory.findUnique({
      where: {
        locationId_itemId: { locationId: data.locationId, itemId: data.itemId },
      },
    });
    const line = await tx.roomInventory.upsert({
      where: {
        locationId_itemId: { locationId: data.locationId, itemId: data.itemId },
      },
      create: data,
      update: data,
    });
    await stayLog(
      tx,
      actor,
      "ROOM_TEMPLATE_UPDATED",
      line.id,
      JSON.stringify({ before, after: data, centralStockChanged: false }),
    );
    return line;
  });
}
export async function registerLinen(actor: Actor, input: unknown) {
  authorize(actor, "rooms:manage");
  const data = z
    .object({
      itemId: id,
      locationId: id,
      quantity: positive,
      notes: z.string().trim().min(3).max(2000),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id=${data.itemId} FOR UPDATE`;
    const item = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: data.itemId },
    });
    const active = await tx.linenBalance.aggregate({
      where: { itemId: data.itemId, status: { not: "RETIRED" } },
      _sum: { quantity: true },
    });
    if ((active._sum.quantity ?? 0) + data.quantity > item.quantity)
      fail(
        "Registration exceeds central stock. Register only untracked physical linen.",
      );
    await tx.linenEnrollment.upsert({
      where: { itemId: item.id },
      create: { itemId: item.id },
      update: {},
    });
    await tx.linenBalance.upsert({
      where: {
        itemId_status_locationId: {
          itemId: item.id,
          status: "AVAILABLE",
          locationId: data.locationId,
        },
      },
      create: {
        itemId: item.id,
        status: "AVAILABLE",
        locationId: data.locationId,
        quantity: data.quantity,
      },
      update: { quantity: { increment: data.quantity } },
    });
    await tx.linenMovement.create({
      data: {
        itemId: item.id,
        quantity: data.quantity,
        newStatus: "AVAILABLE",
        newLocationId: data.locationId,
        userId: actor.id,
        notes: data.notes,
      },
    });
    await stayLog(
      tx,
      actor,
      "LINEN_REGISTERED",
      item.id,
      `${data.quantity} registered: ${data.notes}`,
    );
  });
}
export async function moveLinen(actor: Actor, input: unknown) {
  authorize(actor, "linen");
  const data = z
    .object({
      balanceId: id,
      quantity: positive,
      newStatus: z
        .nativeEnum(LinenStatus)
        .refine((s) => s !== "LAUNDRY", "Use In Laundry"),
      newLocationId: id,
      notes: z.string().trim().min(3).max(2000),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const source = await tx.linenBalance.findUniqueOrThrow({
      where: { id: data.balanceId },
    });
    await assertRoom(actor, source.locationId, tx, true);
    const target = await assertRoom(actor, data.newLocationId, tx, true);
    if (!target.active) fail("Destination is archived.");
    if (source.status === "RETIRED")
      fail("Retired linen cannot be returned to circulation.");
    if (
      source.locationId === data.newLocationId &&
      source.status === data.newStatus
    )
      fail("Choose a different status or location.");
    if (data.newStatus === "ASSIGNED_TO_ROOM" && target.type !== "ROOM")
      fail("Assigned to Room requires a room destination.");
    const claimed = await tx.linenBalance.updateMany({
      where: { id: source.id, quantity: { gte: data.quantity } },
      data: { quantity: { decrement: data.quantity } },
    });
    if (claimed.count !== 1) fail("Not enough linen in the selected balance.");
    await tx.linenBalance.upsert({
      where: {
        itemId_status_locationId: {
          itemId: source.itemId,
          status: data.newStatus,
          locationId: data.newLocationId,
        },
      },
      create: {
        itemId: source.itemId,
        status: data.newStatus,
        locationId: data.newLocationId,
        quantity: data.quantity,
      },
      update: { quantity: { increment: data.quantity } },
    });
    await tx.linenMovement.create({
      data: {
        itemId: source.itemId,
        quantity: data.quantity,
        previousStatus: source.status,
        newStatus: data.newStatus,
        previousLocationId: source.locationId,
        newLocationId: data.newLocationId,
        userId: actor.id,
        notes: data.notes,
      },
    });
    await stayLog(
      tx,
      actor,
      "LINEN_MOVEMENT",
      source.itemId,
      `${data.quantity}: ${source.status} → ${data.newStatus}; ${data.notes}`,
    );
  });
}
const bookingSchema = z
  .object({
    id: optionalId,
    reference: z.string().trim().min(2).max(80),
    guestName: name,
    mobile: z.string().trim().max(40),
    email: z.union([z.email().max(254), z.literal("")]),
    guestCount: z.coerce.number().int().min(1).max(100),
    checkInDate: z.coerce.date(),
    checkOutDate: z.coerce.date(),
    source: z.nativeEnum(BookingSource),
    notes: text,
    rooms: z.array(id).min(1).max(30),
  })
  .refine(
    (b) => b.checkOutDate > b.checkInDate,
    "Check-out must follow check-in",
  );
export async function saveBooking(actor: Actor, input: unknown) {
  authorize(actor, "booking:manage");
  const data = bookingSchema.parse(input);
  return db.$transaction(async (tx) => {
    const roomIds = [...new Set(data.rooms)].sort();
    for (const roomId of roomIds)
      await tx.$queryRaw`SELECT id FROM "Location" WHERE id=${roomId} FOR UPDATE`;
    if (
      (await tx.location.count({
        where: { id: { in: roomIds }, type: "ROOM", active: true },
      })) !== roomIds.length
    )
      fail("Select active rooms.");
    if (data.id)
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${data.id} FOR UPDATE`;
    const before = data.id
      ? await tx.booking.findUniqueOrThrow({
          where: { id: data.id },
          include: { rooms: true },
        })
      : null;
    if (
      before &&
      (before.status !== "UPCOMING" ||
        (await tx.stayInspection.count({ where: { bookingId: before.id } })))
    )
      fail(
        "A stay with inspections or occupancy cannot be edited. History is preserved.",
      );
    if (
      await tx.bookingRoom.count({
        where: {
          locationId: { in: roomIds },
          booking: {
            id: { not: data.id ?? "" },
            status: { in: ["UPCOMING", "CHECKED_IN"] },
            checkInDate: { lt: data.checkOutDate },
            checkOutDate: { gt: data.checkInDate },
          },
        },
      })
    )
      fail("A selected room already has an overlapping stay.");
    const { id: bookingId, rooms, ...fields } = data;
    void rooms;
    const booking = bookingId
      ? await tx.booking.update({ where: { id: bookingId }, data: fields })
      : await tx.booking.create({ data: { ...fields, createdById: actor.id } });
    await tx.bookingRoom.deleteMany({ where: { bookingId: booking.id } });
    await tx.bookingRoom.createMany({
      data: roomIds.map((locationId) => ({
        locationId,
        bookingId: booking.id,
      })),
    });
    await stayLog(
      tx,
      actor,
      before ? "BOOKING_UPDATED" : "BOOKING_CREATED",
      booking.id,
      JSON.stringify({
        reference: booking.reference,
        changedFields: Object.keys(fields),
        roomCount: roomIds.length,
        personalDataExcluded: true,
      }),
    );
    return booking;
  });
}
export async function cancelBooking(actor: Actor, bookingId: string) {
  authorize(actor, "booking:manage");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${bookingId} FOR UPDATE`;
    if (
      await tx.stayInspection.count({
        where: { bookingId, type: "CHECK_IN", status: "COMPLETED" },
      })
    )
      fail(
        "A stay with completed arrival inspections cannot be cancelled. Complete its departure workflow.",
      );
    const changed = await tx.booking.updateMany({
      where: { id: bookingId, status: "UPCOMING" },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) fail("Only an upcoming stay can be cancelled.");
    await stayLog(
      tx,
      actor,
      "BOOKING_UPDATED",
      bookingId,
      "Booking cancelled; history retained",
    );
  });
}
export async function startInspection(actor: Actor, input: unknown) {
  authorize(actor, "inspection");
  const data = z
    .object({
      bookingId: id,
      locationId: id,
      type: z.enum(["CHECK_IN", "CHECK_OUT"]),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    await assertRoom(actor, data.locationId, tx);
    await tx.$queryRaw`SELECT id FROM "Location" WHERE id=${data.locationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${data.bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: data.bookingId },
      include: { rooms: true },
    });
    if (!booking.rooms.some((r) => r.locationId === data.locationId))
      fail("Room is not part of this booking.");
    const existing = await tx.stayInspection.findUnique({
      where: { bookingId_locationId_type: data },
    });
    if (existing) return existing;
    if (
      data.type === "CHECK_IN" &&
      !["UPCOMING", "CHECKED_IN"].includes(booking.status)
    )
      fail("This stay cannot start a check-in inspection.");
    if (data.type === "CHECK_OUT" && booking.status !== "CHECKED_IN")
      fail("Check-out requires a checked-in booking.");
    let lines: Prisma.StayInspectionLineCreateWithoutInspectionInput[];
    if (data.type === "CHECK_OUT") {
      const baseline = await tx.stayInspection.findUnique({
        where: { bookingId_locationId_type: { ...data, type: "CHECK_IN" } },
        include: { lines: true },
      });
      if (baseline?.status !== "COMPLETED")
        fail("Complete the check-in baseline first.");
      lines = baseline.lines.map((l) => ({
        item: { connect: { id: l.itemId } },
        itemName: l.itemName,
        expectedQuantity: l.expectedQuantity,
        actualQuantity: l.actualQuantity,
        condition: l.condition,
        baselineQuantity: l.actualQuantity,
        baselineCondition: l.condition,
        replacementCost: l.replacementCost,
      }));
    } else {
      const template = await tx.roomInventory.findMany({
        where: { locationId: data.locationId },
        include: { item: true },
      });
      if (!template.length) fail("Define the expected room inventory first.");
      lines = template.map((l) => ({
        item: { connect: { id: l.itemId } },
        itemName: l.item.name,
        expectedQuantity: l.expectedQuantity,
        actualQuantity: l.assignedQuantity,
        condition:
          l.condition === "MISSING"
            ? "MISSING"
            : ["DAMAGED", "FOR_REPAIR", "FOR_REPLACEMENT", "DISPOSED"].includes(
                  l.condition,
                )
              ? "DAMAGED"
              : l.condition === "FAIR"
                ? "MINOR_DAMAGE"
                : "GOOD",
        replacementCost: l.replacementCost,
      }));
    }
    const inspection = await tx.stayInspection.create({
      data: { ...data, userId: actor.id, lines: { create: lines } },
    });
    await stayLog(
      tx,
      actor,
      `${data.type}_INSPECTION_STARTED`,
      inspection.id,
      `Associated with booking ${booking.reference}`,
    );
    return inspection;
  });
}
export async function saveInspection(
  actor: Actor,
  inspectionId: string,
  input: unknown,
  complete: boolean,
) {
  authorize(actor, "inspection");
  const data = z
    .object({
      notes: text,
      lines: z
        .array(
          z.object({
            id,
            actualQuantity: count,
            condition: z.nativeEnum(StayCondition),
            notes: text,
          }),
        )
        .min(1)
        .max(10000),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const inspection = await tx.stayInspection.findUniqueOrThrow({
      where: { id: inspectionId },
      include: { lines: true, booking: true },
    });
    await assertRoom(actor, inspection.locationId, tx);
    await tx.$queryRaw`SELECT id FROM "Location" WHERE id=${inspection.locationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${inspection.bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: inspection.bookingId },
      include: { rooms: true },
    });
    if (booking.status === "CANCELLED" || booking.status === "CHECKED_OUT")
      fail("This stay is closed.");
    if (inspection.status !== "DRAFT") fail("Inspection is already completed.");
    if (
      data.lines.length !== inspection.lines.length ||
      new Set(data.lines.map((l) => l.id)).size !== inspection.lines.length ||
      data.lines.some((l) => !inspection.lines.some((old) => old.id === l.id))
    )
      fail("Submit each inspection item exactly once.");
    if (complete && inspection.type === "CHECK_IN") {
      if (booking.checkInDate.toISOString().slice(0, 10) > manilaDay())
        fail("Check-in cannot complete before the arrival date.");
      const arrivals = await tx.stayInspection.findMany({
        where: {
          locationId: inspection.locationId,
          type: "CHECK_IN",
          status: "COMPLETED",
          bookingId: { not: booking.id },
          booking: { status: { in: ["UPCOMING", "CHECKED_IN"] } },
        },
        select: { bookingId: true },
      });
      for (const arrival of arrivals)
        if (
          !(await tx.stayInspection.count({
            where: {
              bookingId: arrival.bookingId,
              locationId: inspection.locationId,
              type: "CHECK_OUT",
              status: "COMPLETED",
            },
          }))
        )
          fail("Room is still occupied by another stay.");
    }
    const claimed = await tx.stayInspection.updateMany({
      where: { id: inspection.id, status: "DRAFT" },
      data: {
        notes: data.notes,
        userId: actor.id,
        ...(complete ? { status: "COMPLETED", completedAt: new Date() } : {}),
      },
    });
    if (claimed.count !== 1) fail("Inspection already processed.");
    for (const { id: lineId, ...line } of data.lines) {
      await tx.stayInspectionLine.update({ where: { id: lineId }, data: line });
      if (complete) {
        const original = inspection.lines.find((l) => l.id === lineId)!;
        await tx.roomInventory.updateMany({
          where: { locationId: inspection.locationId, itemId: original.itemId },
          data: {
            assignedQuantity: line.actualQuantity,
            condition:
              line.condition === "MISSING"
                ? "MISSING"
                : line.condition === "DAMAGED" || line.condition === "STAINED"
                  ? "DAMAGED"
                  : line.condition === "MINOR_DAMAGE"
                    ? "FAIR"
                    : "GOOD",
          },
        });
      }
    }
    await stayLog(
      tx,
      actor,
      complete ? `${inspection.type}_INSPECTION` : "INSPECTION_DRAFT_SAVED",
      inspection.id,
      JSON.stringify({
        booking: booking.reference,
        notes: data.notes,
        results: data.lines,
      }),
    );
    if (complete) {
      const countCompleted = await tx.stayInspection.count({
        where: {
          bookingId: booking.id,
          type: inspection.type,
          status: "COMPLETED",
        },
      });
      if (countCompleted === booking.rooms.length) {
        const next =
          inspection.type === "CHECK_IN" ? "CHECKED_IN" : "CHECKED_OUT";
        const changed = await tx.booking.updateMany({
          where: {
            id: booking.id,
            status: inspection.type === "CHECK_IN" ? "UPCOMING" : "CHECKED_IN",
          },
          data: {
            status: next,
            ...(next === "CHECKED_IN"
              ? { checkedInAt: new Date() }
              : { checkedOutAt: new Date() }),
          },
        });
        if (changed.count)
          await stayLog(
            tx,
            actor,
            inspection.type,
            booking.id,
            `All rooms inspected; stay ${next}`,
          );
      }
    }
  });
}
export async function reportInspectionIssue(actor: Actor, input: unknown) {
  authorize(actor, "inspection");
  const data = z
    .object({
      lineId: id,
      type: z.nativeEnum(ReportType),
      quantity: positive,
      description: z.string().trim().min(3).max(2000),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const line = await tx.stayInspectionLine.findUniqueOrThrow({
      where: { id: data.lineId },
      include: {
        inspection: { include: { booking: true } },
        attachments: true,
      },
    });
    const inspection = line.inspection;
    await assertRoom(actor, inspection.locationId, tx);
    if (inspection.type !== "CHECK_OUT" || inspection.status !== "COMPLETED")
      fail("An issue must come from a completed check-out inspection.");
    if (
      inspectionFlags(
        line.expectedQuantity,
        line.actualQuantity,
        line.condition,
        line.baselineQuantity,
        line.baselineCondition,
      ).every((f) => f === "Complete")
    )
      fail("This inspection line has no discrepancy.");
    if (
      data.quantity >
      Math.max(
        line.expectedQuantity,
        line.baselineQuantity ?? 0,
        line.actualQuantity,
        1,
      )
    )
      fail("Issue quantity exceeds the inspection baseline.");
    const report = await tx.damageReport.create({
      data: {
        itemId: line.itemId,
        locationId: inspection.locationId,
        bookingId: inspection.bookingId,
        inspectionLineId: line.id,
        type: data.type,
        quantity: data.quantity,
        description: data.description,
        userId: actor.id,
        estimatedCost: undefined,
        photos: {
          create: line.attachments.map((a) => ({
            contentType: a.contentType,
            data: a.data,
            storedFileId: a.storedFileId,
          })),
        },
      },
    });
    await stayLog(
      tx,
      actor,
      "BOOKING_ISSUE_REPORTED",
      report.id,
      `Associated with booking ${inspection.booking.reference}; attribution pending management review. ${data.description}`,
    );
    return report;
  });
}
const reviewedStatuses = [
  "FOR_REPAIR",
  "FOR_REPLACEMENT",
  "REPLACED",
  "WRITTEN_OFF",
  "RESOLVED",
];
export async function createGuestCharge(actor: Actor, input: unknown) {
  authorize(actor, "charge:review");
  const data = z
    .object({
      id: optionalId,
      damageReportId: id,
      quantity: positive,
      replacementCost: money,
      amount: money,
      reason: z.string().trim().min(3).max(2000),
      notes: text,
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DamageReport" WHERE id=${data.damageReportId} FOR UPDATE`;
    const report = await tx.damageReport.findUniqueOrThrow({
      where: { id: data.damageReportId },
    });
    if (
      !report.bookingId ||
      !report.reviewedAt ||
      !reviewedStatuses.includes(report.status)
    )
      fail(
        "Management must finish reviewing this booking-associated issue first.",
      );
    if (data.quantity > report.quantity)
      fail("Charge quantity exceeds the reviewed issue quantity.");
    const { id: chargeId, ...fields } = data;
    if (chargeId)
      await tx.$queryRaw`SELECT id FROM "GuestCharge" WHERE id=${chargeId} FOR UPDATE`;
    const before = chargeId
      ? await tx.guestCharge.findUniqueOrThrow({ where: { id: chargeId } })
      : null;
    if (
      before &&
      (before.status !== "DRAFT" ||
        before.damageReportId !== data.damageReportId)
    )
      fail("Only a draft charge for the same reviewed issue can be edited.");
    const charge = before
      ? await tx.guestCharge.update({ where: { id: before.id }, data: fields })
      : await tx.guestCharge.create({
          data: {
            ...fields,
            reference: stamp("GC"),
            bookingId: report.bookingId,
            createdById: actor.id,
          },
        });
    await stayLog(
      tx,
      actor,
      before ? "GUEST_CHARGE_EDITED" : "GUEST_CHARGE_CREATED",
      charge.id,
      JSON.stringify({
        before,
        after: fields,
        associatedBooking: report.bookingId,
      }),
    );
    return charge;
  });
}
export async function transitionCharge(
  actor: Actor,
  chargeId: string,
  next: string,
  notes: string,
) {
  const target = z
    .enum(["FOR_REVIEW", "APPROVED", "WAIVED", "PAID", "UNPAID", "CANCELLED"])
    .parse(next);
  authorize(actor, target === "APPROVED" ? "charge:approve" : "charge:review");
  text.parse(notes);
  return db.$transaction(async (tx) => {
    const charge = await tx.guestCharge.findUniqueOrThrow({
      where: { id: chargeId },
      include: { damageReport: true },
    });
    await tx.$queryRaw`SELECT id FROM "DamageReport" WHERE id=${charge.damageReportId} FOR UPDATE`;
    charge.damageReport = await tx.damageReport.findUniqueOrThrow({
      where: { id: charge.damageReportId },
    });
    const transitions: Record<string, string[]> = {
      FOR_REVIEW: ["DRAFT"],
      APPROVED: ["FOR_REVIEW"],
      WAIVED: ["DRAFT", "FOR_REVIEW", "APPROVED", "UNPAID"],
      PAID: ["APPROVED", "UNPAID"],
      UNPAID: ["APPROVED"],
      CANCELLED: ["DRAFT", "FOR_REVIEW"],
    };
    if (!transitions[target].includes(charge.status))
      fail("Guest charge status no longer permits this action.");
    if (target === "WAIVED" && ["APPROVED", "UNPAID"].includes(charge.status))
      authorize(actor, "charge:approve");
    if (
      target === "APPROVED" &&
      (!charge.reviewedAt ||
        !charge.damageReport.reviewedAt ||
        !reviewedStatuses.includes(charge.damageReport.status))
    )
      fail("Complete management review before approval.");
    const result = await tx.guestCharge.updateMany({
      where: { id: chargeId, status: charge.status },
      data: {
        status: target,
        notes,
        ...(target === "FOR_REVIEW"
          ? { reviewedById: actor.id, reviewedAt: new Date() }
          : {}),
        ...(target === "APPROVED"
          ? {
              approvedById: actor.id,
              approvedAt: new Date(),
              paymentStatus: "UNPAID",
            }
          : {}),
        ...(target === "PAID"
          ? { paidAt: new Date(), paymentStatus: "PAID" }
          : {}),
        ...(target === "UNPAID" ? { paymentStatus: "UNPAID" } : {}),
        ...(target === "WAIVED" ? { paymentStatus: "WAIVED" } : {}),
      },
    });
    if (result.count !== 1) fail("Guest charge was already processed.");
    await stayLog(
      tx,
      actor,
      `GUEST_CHARGE_${target}`,
      chargeId,
      notes || `Charge ${target}`,
    );
  });
}
export async function saveExpense(actor: Actor, input: unknown) {
  authorize(actor, "expense:submit");
  const data = z
    .object({
      id: optionalId,
      incurredAt: z.coerce.date(),
      category: z.nativeEnum(ExpenseCategory),
      description: z.string().trim().min(3).max(2000),
      payee: text,
      supplierId: optionalId,
      amount: money.refine((v) => v > 0, "Amount must be positive"),
      paymentMethod: z.nativeEnum(PaymentMethod),
      receiptNumber: text,
      purchaseId: optionalId,
      damageReportId: optionalId,
      bookingId: optionalId,
      notes: text,
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const { id: expenseId, ...fields } = data;
    if (expenseId)
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id=${expenseId} FOR UPDATE`;
    const before = expenseId
      ? await tx.expense.findUniqueOrThrow({ where: { id: expenseId } })
      : null;
    if (before) {
      authorize(actor, "expense:manage");
      if (before.status !== "SUBMITTED")
        fail(
          "Reviewed expenses are locked. Ask an Owner to review a correction.",
        );
    }
    if (
      actor.role === "CARETAKER" &&
      (fields.purchaseId || fields.damageReportId || fields.supplierId)
    )
      fail(
        "Caretakers can submit a payee and booking reference; management links restricted financial records.",
      );
    if (fields.bookingId && actor.role === "CARETAKER") {
      const accessible = await tx.bookingRoom.findFirst({
        where: {
          bookingId: fields.bookingId,
          location: { assignments: { some: { userId: actor.id } } },
        },
      });
      if (!accessible) fail("Booking is not assigned to you.");
    }
    const expense = before
      ? await tx.expense.updateMany({
          where: { id: before.id, status: "SUBMITTED" },
          data: fields,
        })
      : null;
    if (before && expense?.count !== 1) fail("Expense is already reviewed.");
    const saved = before
      ? await tx.expense.findUniqueOrThrow({ where: { id: before.id } })
      : await tx.expense.create({
          data: { ...fields, reference: stamp("EXP"), recordedById: actor.id },
        });
    await stayLog(
      tx,
      actor,
      before ? "EXPENSE_EDITED" : "EXPENSE_SUBMITTED",
      saved.id,
      JSON.stringify({ before, after: fields }),
    );
    return saved;
  });
}
export async function reviewExpense(
  actor: Actor,
  expenseId: string,
  status: string,
) {
  authorize(actor, "expense:manage");
  const next = z.enum(["APPROVED", "REJECTED"]).parse(status);
  return db.$transaction(async (tx) => {
    const changed = await tx.expense.updateMany({
      where: { id: expenseId, status: "SUBMITTED" },
      data: { status: next, reviewedById: actor.id, reviewedAt: new Date() },
    });
    if (changed.count !== 1) fail("Expense has already been reviewed.");
    await stayLog(
      tx,
      actor,
      `EXPENSE_${next}`,
      expenseId,
      `Expense ${next}; immutable after review`,
    );
  });
}
export type AttachmentInput = {
  data: Uint8Array<ArrayBuffer>;
  contentType: string;
  originalName?: string;
};
export async function attachEvidence(
  actor: Actor,
  input: { inspectionLineId?: string; expenseId?: string },
  photo: AttachmentInput,
) {
  if (Boolean(input.inspectionLineId) === Boolean(input.expenseId))
    fail("Choose exactly one attachment parent.");
  // Authorize before sending bytes to storage, and recheck under transaction locks.
  if (input.inspectionLineId) {
    const line = await db.stayInspectionLine.findUniqueOrThrow({
      where: { id: input.inspectionLineId },
      include: { inspection: true },
    });
    await assertRoom(actor, line.inspection.locationId);
  }
  if (input.expenseId) {
    authorize(actor, "expense:submit");
    const expense = await db.expense.findUniqueOrThrow({
      where: { id: input.expenseId },
    });
    if (actor.role === "CARETAKER" && expense.recordedById !== actor.id)
      fail("This expense is not yours.");
  }
  const file = await stageFile(actor, photo, !!input.expenseId);
  try {
    return await db.$transaction(async (tx) => {
      if (input.inspectionLineId) {
        authorize(actor, "inspection");
        const line = await tx.stayInspectionLine.findUniqueOrThrow({
          where: { id: input.inspectionLineId },
          include: { inspection: true },
        });
        await assertRoom(actor, line.inspection.locationId, tx);
        await tx.$queryRaw`SELECT id FROM "StayInspection" WHERE id=${line.inspectionId} FOR UPDATE`;
        const inspection = await tx.stayInspection.findUniqueOrThrow({
          where: { id: line.inspectionId },
        });
        if (inspection.status !== "DRAFT")
          fail("Completed inspection evidence is immutable.");
        if (photo.contentType === "application/pdf")
          fail("Inspection evidence must be an image.");
      }
      if (input.expenseId) {
        authorize(actor, "expense:submit");
        await tx.$queryRaw`SELECT id FROM "Expense" WHERE id=${input.expenseId} FOR UPDATE`;
        const expense = await tx.expense.findUniqueOrThrow({
          where: { id: input.expenseId },
        });
        if (actor.role === "CARETAKER" && expense.recordedById !== actor.id)
          fail("This expense is not yours.");
        if (expense.status !== "SUBMITTED")
          fail("Reviewed receipts are immutable.");
      }
      const attachment = await tx.operationAttachment.create({
        data: {
          ...input,
          data: new Uint8Array(),
          contentType: file.contentType,
          storedFileId: file.id,
        },
      });
      await readyFile(tx, file, actor);
      await stayLog(
        tx,
        actor,
        "EVIDENCE_ATTACHED",
        attachment.id,
        "Protected evidence attached",
      );
      return attachment;
    });
  } catch (error) {
    await discardFile(file);
    throw error;
  }
}
