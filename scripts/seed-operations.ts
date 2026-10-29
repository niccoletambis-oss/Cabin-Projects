import "dotenv/config";
import { db } from "../src/lib/db";
import { createItem } from "../src/lib/inventory";
import * as ops from "../src/lib/stay-operations";
import { manilaDay } from "../src/lib/stay-status";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DEMO_DATA !== "true"
  )
    throw new Error(
      "Operational sample data requires ALLOW_DEMO_DATA=true and a development database.",
    );
  const admin = await db.user.findUnique({
    where: { email: "owner@cabin.example" },
  });
  const caretaker = await db.user.findUnique({
    where: { email: "caretaker.dev@cabin.example" },
  });
  if (!admin || admin.role !== "ADMIN" || !admin.active)
    throw new Error(
      "Create the documented development accounts first. Existing accounts will not be overwritten.",
    );
  const places = [
    ["Demo Room 1", "ROOM"],
    ["Demo Room 2", "ROOM"],
    ["Demo Room 3", "ROOM"],
    ["Demo Living Room", "AREA"],
    ["Demo Dining Area", "AREA"],
    ["Demo Kitchen", "AREA"],
    ["Demo Bathroom", "AREA"],
    ["Demo Second Floor", "AREA"],
    ["Demo Pool Area", "AREA"],
    ["Demo Outdoor Area", "AREA"],
    ["Demo Storage Room", "STORAGE"],
    ["Demo Caretaker Area", "AREA"],
    ["Demo Laundry", "LAUNDRY"],
  ] as const;
  const locations = [];
  for (const [name, type] of places) {
    const existing = await db.location.findUnique({ where: { name } });
    locations.push(
      existing ??
        (await ops.saveRoom(admin, {
          name,
          type,
          active: true,
          description: "Development sample location",
          assignees: caretaker ? [caretaker.id] : [],
        })),
    );
  }
  const room = locations[0],
    storage = locations[10];
  const category = await db.category.upsert({
    where: { name: "Demo Room & Linen Essentials" },
    create: { name: "Demo Room & Linen Essentials" },
    update: {},
  });
  const samples = [
    ["Bed Sheets", 2, 700, true],
    ["Pillow Cases", 4, 150, true],
    ["Blankets", 2, 800, true],
    ["Comforters", 1, 1800, true],
    ["Bath Towels", 4, 300, true],
    ["Hand Towels", 2, 120, true],
    ["Pool Towels", 2, 350, true],
    ["Kitchen Towels", 2, 80, true],
    ["Bed", 1, 12000, false],
    ["Mattress", 1, 7000, false],
    ["Pillows", 4, 450, false],
    ["Hangers", 10, 35, false],
    ["Remote Control", 1, 500, false],
    ["Trash Bin", 1, 250, false],
  ] as const;
  const items = [];
  for (let index = 0; index < samples.length; index++) {
    const [name, expected, cost, linen] = samples[index];
    const sku = `DEMO-P3-${String(index + 1).padStart(3, "0")}`;
    const existing = await db.inventoryItem.findUnique({ where: { sku } });
    const item =
      existing ??
      (await createItem(admin, {
        name: `Demo ${name}`,
        sku,
        unit: "pcs",
        quantity: Math.max(20, expected * 2),
        minimumStock: 2,
        unitCost: cost,
        categoryId: category.id,
        locationId: storage.id,
      }));
    items.push(item);
    if (
      !(await db.roomInventory.findUnique({
        where: { locationId_itemId: { locationId: room.id, itemId: item.id } },
      }))
    )
      await ops.saveRoomLine(admin, {
        locationId: room.id,
        itemId: item.id,
        expectedQuantity: expected,
        assignedQuantity: expected,
        condition: "GOOD",
        replacementCost: cost,
        notes: "Development example; not a real guest record",
      });
    for (const pendingRoom of locations.slice(1, 3))
      if (
        !(await db.roomInventory.findUnique({
          where: {
            locationId_itemId: { locationId: pendingRoom.id, itemId: item.id },
          },
        }))
      )
        await ops.saveRoomLine(admin, {
          locationId: pendingRoom.id,
          itemId: item.id,
          expectedQuantity: expected,
          assignedQuantity: 0,
          condition: "GOOD",
          replacementCost: cost,
          notes:
            "Development expected standard; physical count not yet confirmed",
        });
    if (
      linen &&
      !(await db.linenEnrollment.findUnique({ where: { itemId: item.id } }))
    )
      await ops.registerLinen(admin, {
        itemId: item.id,
        locationId: storage.id,
        quantity: 10,
        notes: "Development linen starting balance",
      });
    if (linen) {
      const movements = await db.linenMovement.findMany({
        where: { itemId: item.id },
        select: { notes: true },
      });
      if (
        movements.length === 1 &&
        movements[0].notes === "Development linen starting balance"
      ) {
        const balance = await db.linenBalance.findUniqueOrThrow({
          where: {
            itemId_status_locationId: {
              itemId: item.id,
              status: "AVAILABLE",
              locationId: storage.id,
            },
          },
        });
        if (balance.quantity >= expected)
          await ops.moveLinen(admin, {
            balanceId: balance.id,
            quantity: expected,
            newStatus: "ASSIGNED_TO_ROOM",
            newLocationId: room.id,
            notes: "Development sample room allocation",
          });
        if (name === "Bath Towels")
          await ops.moveLinen(admin, {
            balanceId: balance.id,
            quantity: 2,
            newStatus: "IN_LAUNDRY",
            newLocationId: locations[12].id,
            notes: "Development sample laundry load",
          });
      }
    }
  }
  let booking = await db.booking.findUnique({
    where: { reference: "DEMO-P3-STAY-001" },
  });
  if (!booking) {
    const today = manilaDay();
    booking = await ops.saveBooking(admin, {
      reference: "DEMO-P3-STAY-001",
      guestName: "Development Guest",
      mobile: "",
      email: "guest@example.invalid",
      guestCount: 2,
      checkInDate: today,
      checkOutDate: new Date(new Date(today).getTime() + 86400000)
        .toISOString()
        .slice(0, 10),
      source: "DIRECT",
      notes: "Synthetic development stay; no real guest data",
      rooms: [room.id],
    });
    const inspection = await ops.startInspection(admin, {
      bookingId: booking.id,
      locationId: room.id,
      type: "CHECK_IN",
    });
    const lines = await db.stayInspectionLine.findMany({
      where: { inspectionId: inspection.id },
    });
    await ops.saveInspection(
      admin,
      inspection.id,
      {
        notes: "Development sample arrival inspection",
        lines: lines.map((l) => ({
          id: l.id,
          actualQuantity: l.actualQuantity,
          condition: "GOOD",
          notes: "Sample baseline",
        })),
      },
      true,
    );
  }
  if (
    !(await db.booking.findUnique({
      where: { reference: "DEMO-P3-UPCOMING-001" },
    }))
  ) {
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await ops.saveBooking(admin, {
      reference: "DEMO-P3-UPCOMING-001",
      guestName: "Upcoming Development Guest",
      mobile: "",
      email: "",
      guestCount: 3,
      checkInDate: date,
      checkOutDate: new Date(new Date(date).getTime() + 2 * 86400000)
        .toISOString()
        .slice(0, 10),
      source: "DIRECT",
      notes: "Synthetic upcoming reference",
      rooms: [locations[1].id],
    });
  }
  if (
    !(await db.expense.findFirst({
      where: { description: "Development laundry expense (Phase 3)" },
    }))
  )
    await ops.saveExpense(admin, {
      incurredAt: new Date(),
      category: "LAUNDRY",
      description: "Development laundry expense (Phase 3)",
      payee: "Development Laundry",
      supplierId: null,
      amount: 450,
      paymentMethod: "CASH",
      receiptNumber: "DEMO-ONLY",
      purchaseId: null,
      damageReportId: null,
      bookingId: booking.id,
      notes: "Synthetic sample; not an actual payable",
    });
  console.log(
    "Operational sample data added where missing. Existing rooms, templates, quantities, bookings and expenses preserved.",
  );
}
main().finally(() => db.$disconnect());
