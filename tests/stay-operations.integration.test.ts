import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { stayFixture, cleanupStay } from "./stay-fixtures";
import * as ops from "../src/lib/stay-operations";
import { reviewDamage } from "../src/lib/operations";
import {
  operationalReport,
  reportKinds,
  reportCsv,
  csvCell,
} from "../src/lib/operational-reports";
import { inspectionFlags } from "../src/lib/stay-status";
const png = {
  data: new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG0cAAAAASUVORK5CYII=",
      "base64",
    ),
  ),
  contentType: "image/png",
};
test("Phase 3 operational stay lifecycle, permissions and history", async (t) => {
  const f = await stayFixture();
  let checkInId = "",
    checkOutId = "",
    reportId = "",
    chargeId = "",
    expenseId = "";
  try {
    await t.test(
      "room templates compare expected/assigned and never alter central stock",
      async () => {
        assert.equal(
          (
            await db.roomInventory.findUniqueOrThrow({
              where: {
                locationId_itemId: { locationId: f.room.id, itemId: f.item.id },
              },
            })
          ).expectedQuantity,
          4,
        );
        assert.equal(
          (
            await db.inventoryItem.findUniqueOrThrow({
              where: { id: f.item.id },
            })
          ).quantity,
          10,
        );
        await assert.rejects(ops.saveRoomLine(f.caretaker, {}), /Permission/);
        await assert.rejects(
          ops.assertRoom(f.other, f.room.id),
          /not assigned/,
        );
      },
    );
    await t.test(
      "linen registration and concurrent movements conserve total and reject negative quantities",
      async () => {
        await ops.registerLinen(f.manager, {
          itemId: f.item.id,
          locationId: f.storage.id,
          quantity: 8,
          notes: "Register eight towels",
        });
        const source = await db.linenBalance.findUniqueOrThrow({
          where: {
            itemId_status_locationId: {
              itemId: f.item.id,
              status: "AVAILABLE",
              locationId: f.storage.id,
            },
          },
        });
        const outcomes = await Promise.allSettled([
          ops.moveLinen(f.caretaker, {
            balanceId: source.id,
            quantity: 6,
            newStatus: "FOR_LAUNDRY",
            newLocationId: f.laundry.id,
            notes: "First transfer",
          }),
          ops.moveLinen(f.caretaker, {
            balanceId: source.id,
            quantity: 6,
            newStatus: "FOR_LAUNDRY",
            newLocationId: f.laundry.id,
            notes: "Concurrent transfer",
          }),
        ]);
        assert.equal(
          outcomes.filter((o) => o.status === "fulfilled").length,
          1,
        );
        const balances = await db.linenBalance.findMany({
          where: { itemId: f.item.id },
        });
        assert.equal(
          balances.reduce((n, b) => n + b.quantity, 0),
          8,
        );
        assert.ok(balances.every((b) => b.quantity >= 0));
        await assert.rejects(
          ops.registerLinen(f.manager, {
            itemId: f.item.id,
            locationId: f.storage.id,
            quantity: 3,
            notes: "Too many",
          }),
          /exceeds central/,
        );
        await assert.rejects(
          ops.moveLinen(f.caretaker, {
            balanceId: source.id,
            quantity: -1,
            newStatus: "USED",
            newLocationId: f.room.id,
            notes: "Invalid negative",
          }),
        );
        await assert.rejects(
          db.linenBalance.update({
            where: { id: source.id },
            data: { quantity: -1 },
          }),
        );
        assert.equal(
          (
            await db.inventoryItem.findUniqueOrThrow({
              where: { id: f.item.id },
            })
          ).quantity,
          10,
        );
      },
    );
    await t.test(
      "booking creation validates role, dates and overlapping rooms",
      async () => {
        await assert.rejects(ops.saveBooking(f.caretaker, {}), /Permission/);
        await assert.rejects(
          ops.saveBooking(f.manager, {
            reference: `${f.prefix}-overlap`,
            guestName: "Other Guest",
            mobile: "",
            email: "",
            guestCount: 1,
            checkInDate: f.booking.checkInDate,
            checkOutDate: f.booking.checkOutDate,
            source: "DIRECT",
            notes: "Synthetic only",
            rooms: [f.room.id],
          }),
          /overlapping/,
        );
        assert.equal(f.booking.status, "UPCOMING");
      },
    );
    await t.test(
      "assigned caretaker completes check-in baseline and occupancy without central stock changes",
      async () => {
        await assert.rejects(
          ops.startInspection(f.other, {
            bookingId: f.booking.id,
            locationId: f.room.id,
            type: "CHECK_IN",
          }),
          /not assigned/,
        );
        const checkIn = await ops.startInspection(f.caretaker, {
          bookingId: f.booking.id,
          locationId: f.room.id,
          type: "CHECK_IN",
        });
        checkInId = checkIn.id;
        const lines = await db.stayInspectionLine.findMany({
          where: { inspectionId: checkIn.id },
        });
        await ops.attachEvidence(
          f.caretaker,
          { inspectionLineId: lines[0].id },
          png,
        );
        await ops.saveInspection(
          f.caretaker,
          checkIn.id,
          {
            notes: "Arrival baseline",
            lines: lines.map((l) => ({
              id: l.id,
              actualQuantity: 4,
              condition: "GOOD",
              notes: "Checked before occupancy",
            })),
          },
          true,
        );
        assert.equal(
          (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
            .status,
          "CHECKED_IN",
        );
        assert.equal(
          await db.guestCharge.count({ where: { bookingId: f.booking.id } }),
          0,
        );
        await assert.rejects(
          ops.attachEvidence(
            f.caretaker,
            { inspectionLineId: lines[0].id },
            png,
          ),
          /immutable/,
        );
        assert.equal(
          (
            await db.inventoryItem.findUniqueOrThrow({
              where: { id: f.item.id },
            })
          ).quantity,
          10,
        );
      },
    );
    await t.test(
      "check-out snapshots check-in baseline even when the current room standard changes",
      async () => {
        await ops.saveRoomLine(f.manager, {
          locationId: f.room.id,
          itemId: f.item.id,
          expectedQuantity: 5,
          assignedQuantity: 4,
          condition: "GOOD",
          replacementCost: 300,
          notes: "New future standard",
        });
        const out = await ops.startInspection(f.caretaker, {
          bookingId: f.booking.id,
          locationId: f.room.id,
          type: "CHECK_OUT",
        });
        checkOutId = out.id;
        const lines = await db.stayInspectionLine.findMany({
          where: { inspectionId: out.id },
        });
        assert.equal(lines[0].baselineQuantity, 4);
        assert.equal(lines[0].expectedQuantity, 4);
        assert.equal(Number(lines[0].replacementCost), 200);
        await ops.attachEvidence(
          f.caretaker,
          { inspectionLineId: lines[0].id },
          png,
        );
        const input = {
          notes: "Departure inspection",
          lines: lines.map((l) => ({
            id: l.id,
            actualQuantity: 3,
            condition: "DAMAGED",
            notes: "One missing and remaining linen damaged",
          })),
        };
        const outcomes = await Promise.allSettled([
          ops.saveInspection(f.caretaker, out.id, input, true),
          ops.saveInspection(f.caretaker, out.id, input, true),
        ]);
        assert.equal(
          outcomes.filter((o) => o.status === "fulfilled").length,
          1,
        );
        assert.equal(
          (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
            .status,
          "CHECKED_OUT",
        );
        assert.equal(
          await db.activityLog.count({
            where: { entityId: f.booking.id, action: "CHECK_OUT" },
          }),
          1,
        );
        assert.deepEqual(inspectionFlags(4, 3, "DAMAGED", 4, "GOOD"), [
          "Shortage",
          "Missing Item",
          "Damaged Item",
          "New Damage",
        ]);
        assert.equal(
          (
            await db.roomInventory.findUniqueOrThrow({
              where: {
                locationId_itemId: { locationId: f.room.id, itemId: f.item.id },
              },
            })
          ).assignedQuantity,
          3,
        );
      },
    );
    await t.test(
      "inspection issue associates a booking and evidence without assigning blame or charging automatically",
      async () => {
        const line = await db.stayInspectionLine.findFirstOrThrow({
          where: { inspectionId: checkOutId },
        });
        const report = await ops.reportInspectionIssue(f.caretaker, {
          lineId: line.id,
          type: "MISSING",
          quantity: 1,
          description: "Missing item associated with booking; review needed",
        });
        reportId = report.id;
        assert.equal(report.bookingId, f.booking.id);
        assert.equal(report.status, "PENDING");
        assert.equal(await db.photoEvidence.count({ where: { reportId } }), 1);
        assert.equal(
          await db.guestCharge.count({ where: { damageReportId: reportId } }),
          0,
        );
        await assert.rejects(
          ops.reportInspectionIssue(f.caretaker, {
            lineId: line.id,
            type: "MISSING",
            quantity: 1,
            description: "Duplicate issue",
          }),
        );
      },
    );
    await t.test(
      "guest charge requires reviewed issue and has one-charge-per-report protection",
      async () => {
        const input = {
          damageReportId: reportId,
          quantity: 1,
          replacementCost: 200,
          amount: 100,
          reason: "Reviewed partial recovery proposal",
          notes: "Tracking only",
        };
        await assert.rejects(
          ops.createGuestCharge(f.manager, input),
          /finish reviewing/,
        );
        await assert.rejects(
          ops.createGuestCharge(f.caretaker, input),
          /Permission/,
        );
        await reviewDamage(f.manager, {
          id: reportId,
          status: "FOR_REPLACEMENT",
          estimatedCost: 200,
          managementRemarks: "Reviewed issue; separate charge approval needed",
        });
        const charge = await ops.createGuestCharge(f.manager, input);
        chargeId = charge.id;
        assert.equal(Number(charge.replacementCost), 200);
        assert.equal(Number(charge.amount), 100);
        const revision = await ops.createGuestCharge(f.manager, {
          ...input,
          id: charge.id,
          amount: 90,
          reason: "Revised draft assessment",
        });
        assert.equal(Number(revision.amount), 90);
        await ops.createGuestCharge(f.manager, { ...input, id: charge.id });
        await assert.rejects(ops.createGuestCharge(f.admin, input));
      },
    );
    await t.test(
      "only Owner approves charges; review and payment tracking are attributable",
      async () => {
        await ops.transitionCharge(
          f.manager,
          chargeId,
          "FOR_REVIEW",
          "Management review complete",
        );
        await assert.rejects(
          ops.transitionCharge(f.manager, chargeId, "APPROVED", "Not allowed"),
          /Permission/,
        );
        await assert.rejects(
          ops.transitionCharge(
            f.caretaker,
            chargeId,
            "APPROVED",
            "Not allowed",
          ),
          /Permission/,
        );
        await ops.transitionCharge(
          f.admin,
          chargeId,
          "APPROVED",
          "Owner approved reduced charge",
        );
        await assert.rejects(
          ops.transitionCharge(
            f.manager,
            chargeId,
            "WAIVED",
            "Cannot override Owner",
          ),
          /Permission/,
        );
        await ops.transitionCharge(
          f.manager,
          chargeId,
          "PAID",
          "Payment recorded manually",
        );
        const charge = await db.guestCharge.findUniqueOrThrow({
          where: { id: chargeId },
        });
        assert.equal(charge.approvedById, f.admin.id);
        assert.equal(charge.paymentStatus, "PAID");
        assert.ok(charge.paidAt);
      },
    );
    await t.test(
      "caretaker submits own expenses and receipts; reviewed expenses cannot be edited",
      async () => {
        const input = {
          incurredAt: new Date(),
          category: "LAUNDRY",
          description: "Synthetic laundry submission",
          payee: "Test laundry",
          amount: 250,
          paymentMethod: "CASH",
          receiptNumber: "TEST-RECEIPT",
          bookingId: f.booking.id,
          supplierId: null,
          purchaseId: null,
          damageReportId: null,
          notes: "Synthetic test expense",
        };
        const expense = await ops.saveExpense(f.caretaker, input);
        expenseId = expense.id;
        await ops.attachEvidence(f.caretaker, { expenseId }, png);
        await assert.rejects(
          ops.saveExpense(f.caretaker, { ...input, id: expense.id }),
          /Permission/,
        );
        await assert.rejects(
          ops.attachEvidence(f.other, { expenseId }, png),
          /not yours/,
        );
        await ops.reviewExpense(f.manager, expense.id, "APPROVED");
        await assert.rejects(
          ops.saveExpense(f.manager, { ...input, id: expense.id, amount: 500 }),
          /locked/,
        );
        await assert.rejects(
          ops.attachEvidence(f.caretaker, { expenseId }, png),
          /immutable/,
        );
      },
    );
    await t.test(
      "financial reports deny Caretakers; filters and all fourteen report types are available",
      async () => {
        await assert.rejects(
          operationalReport(f.caretaker, { type: "expenses" }),
          /Permission/,
        );
        for (const type of reportKinds) {
          const report = await operationalReport(f.manager, { type });
          assert.ok(report.columns.length > 0, type);
        }
        const report = await operationalReport(f.manager, {
          type: "guest-charges",
          bookingId: f.booking.id,
          status: "PAID",
        });
        assert.equal(report.rows.length, 1);
        const expenseReport = await operationalReport(f.admin, {
          type: "expenses",
          bookingId: f.booking.id,
          userId: f.caretaker.id,
          categoryId: "LAUNDRY",
          locationId: f.room.id,
          status: "APPROVED",
        });
        assert.equal(expenseReport.rows.length, 1);
        const outgoing = await operationalReport(f.manager, {
          type: "laundry-movements",
          locationId: f.storage.id,
          itemId: f.item.id,
        });
        assert.equal(outgoing.rows.length, 2); // registration and movement leaving storage
        await assert.rejects(
          operationalReport(f.manager, {
            type: "expenses",
            from: "2026-02-30",
          }),
        );
        await db.inventoryItem.update({
          where: { id: f.item.id },
          data: { unitCost: 19.99 },
        });
        const valuation = await operationalReport(f.manager, {
          type: "inventory-valuation",
          itemId: f.item.id,
        });
        assert.equal(valuation.rows[0][9], 199.9); // decimal arithmetic avoids binary floating-point tails in CSV
        const csv = reportCsv(report.columns, report.rows, true);
        assert.ok(csv.startsWith("\uFEFF"));
        assert.equal(csvCell("=SUM(1,1)"), `"'=SUM(1,1)"`);
        assert.equal(csvCell("  @danger"), `"'  @danger"`);
        assert.equal(csvCell(-1), '"-1"');
      },
    );
    await t.test(
      "management can waive a pre-approval charge without deleting its history",
      async () => {
        const issue = await db.damageReport.create({
          data: {
            itemId: f.item.id,
            locationId: f.room.id,
            bookingId: f.booking.id,
            userId: f.caretaker.id,
            type: "STAINED",
            quantity: 1,
            description: "Synthetic second reviewed issue",
          },
        });
        await reviewDamage(f.manager, {
          id: issue.id,
          status: "FOR_REPAIR",
          estimatedCost: 50,
          managementRemarks: "Reviewed for cleaning rather than replacement",
        });
        const charge = await ops.createGuestCharge(f.manager, {
          damageReportId: issue.id,
          quantity: 1,
          replacementCost: 50,
          amount: 25,
          reason: "Proposed cleaning recovery",
          notes: "Synthetic",
        });
        await ops.transitionCharge(
          f.manager,
          charge.id,
          "WAIVED",
          "Courtesy waiver before approval",
        );
        assert.equal(
          (await db.guestCharge.findUniqueOrThrow({ where: { id: charge.id } }))
            .paymentStatus,
          "WAIVED",
        );
        assert.equal(
          await db.activityLog.count({
            where: { entityId: charge.id, action: "GUEST_CHARGE_WAIVED" },
          }),
          1,
        );
        await assert.rejects(
          ops.createGuestCharge(f.admin, {
            damageReportId: issue.id,
            quantity: 1,
            replacementCost: 50,
            amount: 25,
            reason: "Duplicate waived issue",
            notes: "",
          }),
        );
      },
    );
    await t.test(
      "operational actions retain actor role and immutable history",
      async () => {
        const logs = await db.activityLog.findMany({
          where: { userId: { in: f.users.map((u) => u.id) } },
        });
        for (const action of [
          "ROOM_TEMPLATE_UPDATED",
          "LINEN_MOVEMENT",
          "BOOKING_CREATED",
          "CHECK_IN",
          "CHECK_OUT",
          "CHECK_IN_INSPECTION",
          "CHECK_OUT_INSPECTION",
          "BOOKING_ISSUE_REPORTED",
          "GUEST_CHARGE_CREATED",
          "GUEST_CHARGE_APPROVED",
          "EXPENSE_SUBMITTED",
          "EXPENSE_APPROVED",
        ])
          assert.ok(
            logs.some((l) => l.action === action && l.role),
            action,
          );
        assert.ok(checkInId);
        assert.ok(expenseId);
      },
    );
  } finally {
    await cleanupStay(f);
    await db.$disconnect();
  }
});
test("inspection comparison preserves pre-existing damage and flags stains without assuming blame", () => {
  assert.deepEqual(inspectionFlags(4, 4, "MINOR_DAMAGE", 4, "MINOR_DAMAGE"), [
    "Damaged Item",
  ]);
  assert.deepEqual(inspectionFlags(4, 4, "STAINED", 4, "GOOD"), [
    "Stained Item",
    "New Damage",
  ]);
  assert.ok(
    inspectionFlags(4, 0, "MISSING", 4, "GOOD").includes("Missing Item"),
  );
});
