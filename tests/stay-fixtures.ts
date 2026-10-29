import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
import { createItem } from "../src/lib/inventory";
import * as ops from "../src/lib/stay-operations";
import { manilaDay } from "../src/lib/stay-status";
export async function stayFixture() {
  const prefix = `P3-${randomUUID().slice(0, 10)}`;
  const password = "TemporaryFixture2026!";
  const passwordHash = await hashPassword(password);
  const users = await Promise.all(
    (["ADMIN", "MANAGER", "CARETAKER", "CARETAKER"] as const).map((role, i) =>
      db.user.create({
        data: {
          name: `${prefix} ${role} ${i}`,
          email: `${prefix}-${i}@test.invalid`.toLowerCase(),
          role,
          passwordHash,
        },
      }),
    ),
  );
  const [admin, manager, caretaker, other] = users;
  const category = await db.category.create({
    data: { name: `${prefix} linen` },
  });
  const storage = await ops.saveRoom(admin, {
    name: `${prefix} storage`,
    description: "Test storage",
    type: "STORAGE",
    active: true,
    assignees: [],
  });
  const laundry = await ops.saveRoom(admin, {
    name: `${prefix} laundry`,
    description: "Test laundry",
    type: "LAUNDRY",
    active: true,
    assignees: [],
  });
  const room = await ops.saveRoom(admin, {
    name: `${prefix} room`,
    description: "Assigned test room",
    type: "ROOM",
    active: true,
    assignees: [caretaker.id],
  });
  const otherRoom = await ops.saveRoom(admin, {
    name: `${prefix} other room`,
    description: "Other test room",
    type: "ROOM",
    active: true,
    assignees: [other.id],
  });
  const item = await createItem(admin, {
    name: `${prefix} bath towels`,
    sku: prefix,
    unit: "pcs",
    quantity: 10,
    minimumStock: 2,
    unitCost: 50,
    categoryId: category.id,
    locationId: storage.id,
  });
  await ops.saveRoomLine(manager, {
    locationId: room.id,
    itemId: item.id,
    expectedQuantity: 4,
    assignedQuantity: 4,
    condition: "GOOD",
    replacementCost: 200,
    notes: "Test room standard",
  });
  const date = manilaDay();
  const next = new Date(new Date(date).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
  const booking = await ops.saveBooking(manager, {
    reference: `${prefix}-STAY`,
    guestName: "Development Guest",
    mobile: "",
    email: "",
    guestCount: 2,
    checkInDate: date,
    checkOutDate: next,
    source: "DIRECT",
    notes: "Synthetic guest only",
    rooms: [room.id],
  });
  return {
    prefix,
    password,
    users,
    admin,
    manager,
    caretaker,
    other,
    category,
    storage,
    laundry,
    room,
    otherRoom,
    item,
    booking,
  };
}
export async function cleanupStay(f: Awaited<ReturnType<typeof stayFixture>>) {
  const userIds = f.users.map((u) => u.id);
  const locationIds = [f.room.id, f.otherRoom.id, f.storage.id, f.laundry.id];
  const bookings = await db.booking.findMany({
    where: { createdById: { in: userIds } },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  const inspections = await db.stayInspection.findMany({
    where: { bookingId: { in: bookingIds } },
    select: { id: true },
  });
  const inspectionIds = inspections.map((i) => i.id);
  const lines = await db.stayInspectionLine.findMany({
    where: { inspectionId: { in: inspectionIds } },
    select: { id: true },
  });
  const lineIds = lines.map((l) => l.id);
  const reports = await db.damageReport.findMany({
    where: {
      OR: [{ bookingId: { in: bookingIds } }, { userId: { in: userIds } }],
    },
    select: { id: true },
  });
  const reportIds = reports.map((r) => r.id);
  const expenses = await db.expense.findMany({
    where: { recordedById: { in: userIds } },
    select: { id: true },
  });
  const expenseIds = expenses.map((e) => e.id);
  await db.operationAttachment.deleteMany({
    where: {
      OR: [
        { inspectionLineId: { in: lineIds } },
        { expenseId: { in: expenseIds } },
      ],
    },
  });
  await db.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await db.guestCharge.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.photoEvidence.deleteMany({ where: { reportId: { in: reportIds } } });
  await db.damageReport.deleteMany({ where: { id: { in: reportIds } } });
  await db.stayInspectionLine.deleteMany({ where: { id: { in: lineIds } } });
  await db.stayInspection.deleteMany({ where: { id: { in: inspectionIds } } });
  await db.bookingRoom.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await db.linenMovement.deleteMany({ where: { itemId: f.item.id } });
  await db.linenBalance.deleteMany({ where: { itemId: f.item.id } });
  await db.linenEnrollment.deleteMany({ where: { itemId: f.item.id } });
  await db.roomInventory.deleteMany({
    where: { locationId: { in: locationIds } },
  });
  await db.locationAssignment.deleteMany({
    where: { locationId: { in: locationIds } },
  });
  await db.stockTransaction.deleteMany({ where: { itemId: f.item.id } });
  await db.inventoryItem.delete({ where: { id: f.item.id } });
  await db.location.deleteMany({ where: { id: { in: locationIds } } });
  await db.category.delete({ where: { id: f.category.id } });
  await db.activityLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.storedFile.deleteMany({ where: { createdById: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}
