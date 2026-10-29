import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { db } from "../src/lib/db";
import { stayFixture, cleanupStay } from "./stay-fixtures";
import { manilaDay } from "../src/lib/stay-status";
const require = createRequire(import.meta.url);
const {
  encodeReply,
} = require("next/dist/compiled/react-server-dom-webpack/client.node");
const base = "http://127.0.0.1:3000";
async function main() {
  const f = await stayFixture();
  try {
    const manifest = JSON.parse(
      await readFile(".next/server/server-reference-manifest.json", "utf8"),
    );
    const actionId = (name: string) => {
      const match = Object.entries(manifest.node).find(
        ([, v]) => (v as { exportedName: string }).exportedName === name,
      );
      assert.ok(match);
      return match[0];
    };
    async function login(email: string) {
      const response = await fetch(base + "/api/login", {
        method: "POST",
        headers: { Origin: base },
        body: new URLSearchParams({ email, password: f.password }),
        redirect: "manual",
      });
      assert.equal(response.status, 303);
      return response.headers.get("set-cookie")!.split(";")[0];
    }
    const care = await login(f.caretaker.email),
      manager = await login(f.manager.email),
      admin = await login(f.admin.email),
      other = await login(f.other.email);
    const get = (path: string, cookie = "") =>
      fetch(base + path, {
        headers: cookie ? { Cookie: cookie } : {},
        redirect: "manual",
      });
    async function submit(
      fields: Record<string, unknown>,
      cookie = care,
      expected = "Saved successfully.",
      name = "stayAction",
    ) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields))
        for (const v of Array.isArray(value) ? value : [value])
          form.append(key, v instanceof Blob ? v : String(v));
      const path = name === "stayAction" ? "/rooms" : "/damage";
      const id = actionId(name);
      assert.ok(
        manifest.node[id].workers[`app/(protected)${path}/page`],
        `${name} must be registered on ${path}`,
      );
      const response = await fetch(base + path, {
        method: "POST",
        headers: {
          Origin: base,
          Cookie: cookie,
          "Next-Action": id,
          Accept: "text/x-component",
        },
        body: await encodeReply([{ success: false, message: "" }, form]),
        redirect: "manual",
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.ok(
        body.includes(expected),
        `${fields.intent}: ${body.slice(0, 400)}`,
      );
    }
    for (const path of [
      "/rooms",
      "/linen",
      "/bookings",
      "/inspections",
      "/charges",
      "/expenses",
      "/reports/operations",
    ])
      assert.equal((await get(path)).status, 307, path);
    for (const path of [
      "/rooms",
      "/linen",
      "/bookings",
      "/inspections",
      "/expenses",
      "/expenses/new",
    ])
      assert.equal((await get(path, care)).status, 200, path);
    assert.equal((await get("/charges", care)).status, 307);
    assert.equal((await get("/bookings/new", care)).status, 307);
    assert.equal((await get("/api/reports?type=expenses", care)).status, 403);
    const roomsHtml = await (await get("/rooms", care)).text();
    assert.ok(roomsHtml.includes(f.room.name));
    assert.ok(!roomsHtml.includes(f.otherRoom.name));
    const bookingHtml = await (
      await get(`/bookings/${f.booking.id}`, care)
    ).text();
    assert.ok(!bookingHtml.includes("Synthetic guest only"));
    await submit({
      intent: "inspection-start",
      bookingId: f.booking.id,
      locationId: f.room.id,
      type: "CHECK_IN",
    });
    const arrival = await db.stayInspection.findUniqueOrThrow({
      where: {
        bookingId_locationId_type: {
          bookingId: f.booking.id,
          locationId: f.room.id,
          type: "CHECK_IN",
        },
      },
      include: { lines: true },
    });
    const photo = new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
          "base64",
        ),
      ],
      "test.png",
      { type: "image/png" },
    );
    await submit({
      intent: "attachment",
      inspectionLineId: arrival.lines[0].id,
      file: photo,
    });
    const attachment = await db.operationAttachment.findFirstOrThrow({
      where: { inspectionLineId: arrival.lines[0].id },
    });
    assert.equal((await get(`/api/attachments/${attachment.id}`)).status, 401);
    assert.equal(
      (await get(`/api/attachments/${attachment.id}`, care)).status,
      200,
    );
    assert.equal(
      (await get(`/api/attachments/${attachment.id}`, other)).status,
      403,
    );
    const countForm = (
      inspection: { id: string; lines: { id: string }[] },
      quantity: number,
    ) => ({
      intent: "inspection-save",
      id: inspection.id,
      complete: "true",
      notes: "HTTP inspection",
      lineId: inspection.lines.map((l) => l.id),
      ...Object.fromEntries(
        inspection.lines.flatMap((l) => [
          [`quantity-${l.id}`, quantity],
          [`condition-${l.id}`, "GOOD"],
          [`notes-${l.id}`, "HTTP counted"],
        ]),
      ),
    });
    await submit(countForm(arrival, 4));
    assert.equal(
      (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
        .status,
      "CHECKED_IN",
    );
    await submit({
      intent: "inspection-start",
      bookingId: f.booking.id,
      locationId: f.room.id,
      type: "CHECK_OUT",
    });
    const departure = await db.stayInspection.findUniqueOrThrow({
      where: {
        bookingId_locationId_type: {
          bookingId: f.booking.id,
          locationId: f.room.id,
          type: "CHECK_OUT",
        },
      },
      include: { lines: true },
    });
    await submit(countForm(departure, 3));
    await submit({
      intent: "inspection-issue",
      lineId: departure.lines[0].id,
      type: "MISSING",
      quantity: 1,
      description: "Associated with booking; needs review",
    });
    const report = await db.damageReport.findUniqueOrThrow({
      where: { inspectionLineId: departure.lines[0].id },
    });
    await submit(
      {
        intent: "review-damage",
        id: report.id,
        status: "FOR_REPLACEMENT",
        estimatedCost: 200,
        managementRemarks: "HTTP review complete",
      },
      manager,
      "Saved successfully.",
      "operationAction",
    );
    await submit(
      {
        intent: "guest-charge",
        damageReportId: report.id,
        quantity: 1,
        replacementCost: 200,
        amount: 100,
        reason: "Reviewed partial cost proposal",
        notes: "HTTP charge",
      },
      manager,
    );
    const charge = await db.guestCharge.findUniqueOrThrow({
      where: { damageReportId: report.id },
    });
    await submit(
      {
        intent: "charge-transition",
        id: charge.id,
        status: "FOR_REVIEW",
        notes: "Management review",
      },
      manager,
    );
    await submit(
      {
        intent: "charge-transition",
        id: charge.id,
        status: "APPROVED",
        notes: "Not permitted",
      },
      manager,
      "Permission denied",
    );
    await submit(
      {
        intent: "charge-transition",
        id: charge.id,
        status: "APPROVED",
        notes: "Owner approved",
      },
      admin,
    );
    await submit({
      intent: "expense",
      incurredAt: manilaDay(),
      category: "LAUNDRY",
      description: "HTTP synthetic laundry",
      payee: "Test laundry",
      amount: 200,
      paymentMethod: "CASH",
      receiptNumber: "HTTP-1",
      bookingId: f.booking.id,
      notes: "Synthetic expense",
    });
    const expense = await db.expense.findFirstOrThrow({
      where: { recordedById: f.caretaker.id },
    });
    await submit({ intent: "attachment", expenseId: expense.id, file: photo });
    const receipt = await db.operationAttachment.findFirstOrThrow({
      where: { expenseId: expense.id },
    });
    assert.equal(
      (await get(`/api/attachments/${receipt.id}`, other)).status,
      403,
    );
    await submit(
      { intent: "expense-review", id: expense.id, status: "APPROVED" },
      manager,
    );
    const csv = await get(
      `/api/reports?type=guest-charges&bookingId=${f.booking.id}&format=excel-csv`,
      manager,
    );
    assert.equal(csv.status, 200);
    assert.ok((await csv.text()).includes(f.booking.reference));
    assert.equal((await get(`/inspections/${departure.id}`, care)).status, 200);
    assert.equal((await get(`/expenses/${expense.id}`, care)).status, 200);
    assert.equal((await get(`/charges/${charge.id}`, manager)).status, 200);
    console.log(
      "Phase 3 HTTP smoke passed: scoped rooms/bookings, check-in/out, protected evidence, issue review, Owner-only charges, expense submission/review and financial exports.",
    );
  } finally {
    await cleanupStay(f);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
