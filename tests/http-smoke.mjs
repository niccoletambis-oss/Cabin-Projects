import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "node:crypto";
const require = createRequire(import.meta.url);
const {
  encodeReply,
} = require("next/dist/compiled/react-server-dom-webpack/client.node");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const base = "http://127.0.0.1:3000";
const suffix = Date.now().toString();
const sku = `HTTP-${suffix}`;
const password = "HttpSmokePassword2026!";
const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt-v1:${salt}:${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const users = [];
let category, location;
const auditIds = [],
  purchaseIds = [],
  supplierIds = [];
try {
  const manifest = JSON.parse(
    await readFile(".next/server/server-reference-manifest.json", "utf8"),
  );
  const actionId = (name) => {
    const entry = Object.entries(manifest.node).find(
      ([, v]) => v.exportedName === name,
    );
    assert.ok(entry, `${name} registered`);
    return entry[0];
  };
  async function get(path, cookie = "") {
    return fetch(base + path, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: "manual",
    });
  }
  async function login(email, pass = password) {
    return fetch(base + "/api/login", {
      method: "POST",
      headers: { Origin: base },
      body: new URLSearchParams({ email, password: pass }),
      redirect: "manual",
    });
  }
  async function submit(name, fields, cookie, expected) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      for (const entry of Array.isArray(value) ? value : [value])
        form.append(key, entry instanceof Blob ? entry : String(entry));
    }
    const body = await encodeReply([{ success: false, message: "" }, form]);
    const response = await fetch(base + "/inventory", {
      method: "POST",
      headers: {
        "Next-Action": actionId(name),
        Origin: base,
        Accept: "text/x-component",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      redirect: "manual",
    });
    const text = await response.text();
    if (expected) {
      assert.equal(response.status, 200);
      assert.ok(
        text.includes(expected),
        `${name}: ${expected}; ${text.slice(0, 400)}`,
      );
    }
    return response;
  }
  for (const path of [
    "/",
    "/inventory",
    "/users",
    "/suppliers",
    "/damage",
    "/audits",
    "/low-stock",
    "/purchases",
    "/transactions",
    "/activity",
    "/reports",
    "/settings",
  ]) {
    const r = await get(path);
    assert.ok([303, 307].includes(r.status), `Protected ${path}: ${r.status}`);
    assert.ok(r.headers.get("location")?.endsWith("/login"));
  }
  assert.equal((await get("/login")).status, 200);
  assert.equal((await get("/api/evidence/not-found")).status, 401);
  const badOrigin = await fetch(base + "/api/login", {
    method: "POST",
    headers: { Origin: "https://attacker.invalid" },
    body: new URLSearchParams({ email: "x@example.invalid", password }),
  });
  assert.equal(badOrigin.status, 403);
  for (const role of ["ADMIN", "MANAGER", "CARETAKER"]) {
    const user = await db.user.create({
      data: {
        name: `HTTP ${role}`,
        email: `http-${role}-${suffix}@test.invalid`.toLowerCase(),
        role,
        passwordHash,
      },
    });
    users.push(user);
  }
  const cookies = {};
  for (const user of users) {
    const failed = await login(user.email, "wrong");
    assert.equal(failed.status, 303);
    assert.ok(failed.headers.get("location")?.includes("error=1"));
    const r = await login(user.email);
    assert.equal(r.status, 303);
    const header = r.headers.get("set-cookie");
    assert.ok(header?.includes("HttpOnly"));
    assert.ok(header?.includes("SameSite=lax"));
    cookies[user.role] = header.split(";")[0];
  }
  for (const [role, cookie] of Object.entries(cookies)) {
    for (const path of [
      "/",
      "/inventory",
      "/damage",
      "/audits",
      "/transactions",
      "/low-stock",
      "/settings",
    ])
      assert.equal((await get(path, cookie)).status, 200, `${role} ${path}`);
    const usersResponse = await get("/users", cookie);
    assert.equal(usersResponse.status, role === "ADMIN" ? 200 : 307);
    if (role === "CARETAKER")
      for (const path of ["/suppliers", "/purchases", "/activity", "/reports"])
        assert.equal(
          (await get(path, cookie)).status,
          307,
          `Caretaker denied ${path}`,
        );
  }
  category = await db.category.create({
    data: { name: `HTTP category ${suffix}` },
  });
  location = await db.location.create({
    data: { name: `HTTP room ${suffix}` },
  });
  const fields = {
    intent: "add",
    name: `HTTP test towels ${suffix}`,
    sku,
    unit: "pcs",
    quantity: 5,
    minimumStock: 2,
    unitCost: 12345.67,
    categoryId: category.id,
    locationId: location.id,
  };
  await submit(
    "inventoryAction",
    fields,
    cookies.CARETAKER,
    "Permission denied",
  );
  assert.equal(await db.inventoryItem.findUnique({ where: { sku } }), null);
  await submit("inventoryAction", fields, "");
  assert.equal(await db.inventoryItem.findUnique({ where: { sku } }), null);
  await submit(
    "inventoryAction",
    fields,
    cookies.ADMIN,
    "Item added to inventory.",
  );
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { sku } });
  await submit(
    "inventoryAction",
    {
      intent: "stock",
      itemId: item.id,
      type: "IN",
      quantity: 3,
      note: "HTTP delivery",
    },
    cookies.CARETAKER,
    "Stock updated successfully.",
  );
  await submit(
    "inventoryAction",
    {
      intent: "stock",
      itemId: item.id,
      type: "OUT",
      quantity: 2,
      note: "HTTP guest supplies",
    },
    cookies.CARETAKER,
    "Stock updated successfully.",
  );
  await submit(
    "inventoryAction",
    {
      intent: "stock",
      itemId: item.id,
      type: "OUT",
      quantity: 7,
      note: "HTTP overdraw",
    },
    cookies.CARETAKER,
    "Not enough stock",
  );
  assert.equal(
    (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
      .quantity,
    6,
  );
  const caretakerInventory = await (
    await get("/inventory", cookies.CARETAKER)
  ).text();
  assert.ok(!caretakerInventory.includes("12345.67"));
  assert.ok(!caretakerInventory.includes("12,345.67"));
  assert.ok(!caretakerInventory.includes("UNIT COST"));
  const caretakerDashboard = await (await get("/", cookies.CARETAKER)).text();
  assert.ok(!caretakerDashboard.includes("Inventory value"));
  assert.equal(
    (await get(`/inventory/${item.id}`, cookies.CARETAKER)).status,
    200,
  );
  assert.ok(
    !(
      await (await get(`/inventory/${item.id}`, cookies.CARETAKER)).text()
    ).includes("12345.67"),
  );
  const managerInventory = await (
    await get("/inventory", cookies.MANAGER)
  ).text();
  assert.ok(managerInventory.includes("12,345.67"));
  await submit(
    "operationAction",
    {
      intent: "user",
      name: "Forbidden",
      email: `forbidden-${suffix}@test.invalid`,
      role: "ADMIN",
      active: "true",
      password,
    },
    cookies.MANAGER,
    "Permission denied",
  );
  assert.equal(
    await db.user.count({
      where: { email: `forbidden-${suffix}@test.invalid` },
    }),
    0,
  );
  await submit(
    "operationAction",
    {
      intent: "damage",
      itemId: item.id,
      type: "MISSING",
      quantity: 1,
      locationId: location.id,
      description: "HTTP missing towel",
      photo: new File(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
            "base64",
          ),
        ],
        "evidence.png",
        { type: "image/png" },
      ),
    },
    cookies.CARETAKER,
    "Saved successfully.",
  );
  const report = await db.damageReport.findFirstOrThrow({
    where: { itemId: item.id },
  });
  assert.equal(report.userId, users.find((u) => u.role === "CARETAKER").id);

  const photo = await db.photoEvidence.findFirstOrThrow({
    where: { reportId: report.id },
  });
  assert.equal((await get(`/api/evidence/${photo.id}`)).status, 401);
  const evidence = await get(`/api/evidence/${photo.id}`, cookies.CARETAKER);
  assert.equal(evidence.status, 200);
  assert.equal(evidence.headers.get("content-type"), "image/webp");
  assert.ok((await evidence.arrayBuffer()).byteLength > 8);
  await submit(
    "operationAction",
    {
      intent: "review-damage",
      id: report.id,
      status: "UNDER_REVIEW",
      estimatedCost: 100,
      managementRemarks: "HTTP review",
    },
    cookies.MANAGER,
    "Saved successfully.",
  );
  const supplierName = `HTTP supplier ${suffix}`;
  await submit(
    "operationAction",
    {
      intent: "supplier",
      name: supplierName,
      contactPerson: "Contact",
      phone: "",
      email: "",
      address: "",
      notes: "HTTP supplier",
      active: "true",
    },
    cookies.MANAGER,
    "Saved successfully.",
  );
  const supplier = await db.supplier.findFirstOrThrow({
    where: { name: supplierName },
  });
  supplierIds.push(supplier.id);
  await submit(
    "operationAction",
    {
      intent: "purchase",
      supplierId: supplier.id,
      notes: "HTTP order",
      status: "FOR_APPROVAL",
      selected: [item.id],
      [`quantity-${item.id}`]: 2,
      [`cost-${item.id}`]: 100,
    },
    cookies.MANAGER,
    "Saved successfully.",
  );
  const purchase = await db.purchase.findFirstOrThrow({
    where: { supplierId: supplier.id },
  });
  purchaseIds.push(purchase.id);
  assert.equal(
    (await get(`/purchases/${purchase.id}`, cookies.MANAGER)).status,
    200,
  );
  await submit(
    "operationAction",
    { intent: "transition-purchase", id: purchase.id, status: "APPROVED" },
    cookies.MANAGER,
    "Permission denied",
  );
  await submit(
    "operationAction",
    { intent: "transition-purchase", id: purchase.id, status: "APPROVED" },
    cookies.ADMIN,
    "Saved successfully.",
  );
  await submit(
    "operationAction",
    { intent: "transition-purchase", id: purchase.id, status: "PURCHASED" },
    cookies.MANAGER,
    "Saved successfully.",
  );
  await submit(
    "operationAction",
    { intent: "transition-purchase", id: purchase.id, status: "RECEIVED" },
    cookies.MANAGER,
    "Saved successfully.",
  );
  await submit(
    "operationAction",
    { intent: "transition-purchase", id: purchase.id, status: "RECEIVED" },
    cookies.MANAGER,
    "Purchase status no longer",
  );
  assert.equal(
    (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
      .quantity,
    8,
  );
  const caretaker = users.find((u) => u.role === "CARETAKER");
  await submit(
    "operationAction",
    {
      intent: "start-audit",
      locationId: location.id,
      note: "HTTP assigned check",
      assigneeId: caretaker.id,
    },
    cookies.MANAGER,
    "Saved successfully.",
  );
  const audit = await db.inventoryAudit.findFirstOrThrow({
    where: { locationId: location.id },
    include: { lines: true },
  });
  auditIds.push(audit.id);
  assert.equal(
    (await get(`/audits/${audit.id}`, cookies.CARETAKER)).status,
    200,
  );
  const line = audit.lines[0];
  await submit(
    "operationAction",
    {
      intent: "complete-audit",
      id: audit.id,
      lineId: [line.id],
      [`count-${line.id}`]: 7,
      [`condition-${line.id}`]: "GOOD",
      [`remarks-${line.id}`]: "Counted by caretaker",
    },
    cookies.CARETAKER,
    "Saved successfully.",
  );
  assert.equal(
    (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
      .quantity,
    8,
  );
  await submit(
    "operationAction",
    {
      intent: "review-audit",
      id: audit.id,
      remarks: "HTTP reviewed without adjustment",
      adjust: "false",
    },
    cookies.MANAGER,
    "Saved successfully.",
  );
  assert.equal(
    (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
      .quantity,
    8,
  );
  const badLogout = await fetch(base + "/api/logout", {
    method: "POST",
    headers: { Origin: "https://attacker.invalid", Cookie: cookies.CARETAKER },
  });
  assert.equal(badLogout.status, 403);
  assert.equal((await get("/api/logout", cookies.CARETAKER)).status, 405);
  const logout = await fetch(base + "/api/logout", {
    method: "POST",
    headers: { Origin: base, Cookie: cookies.CARETAKER },
    redirect: "manual",
  });
  assert.equal(logout.status, 303);
  assert.equal((await get("/inventory", cookies.CARETAKER)).status, 307);
  console.log(
    "HTTP smoke passed: login/logout, 12 protected routes, role restrictions, cost redaction, add item, stock in/out, negative-stock feedback, report/evidence review, assigned audit, purchase approval/receiving and duplicate receiving protection.",
  );
} finally {
  await db.auditLine.deleteMany({ where: { auditId: { in: auditIds } } });
  await db.inventoryAudit.deleteMany({ where: { id: { in: auditIds } } });
  await db.purchaseLine.deleteMany({
    where: { purchaseId: { in: purchaseIds } },
  });
  await db.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
  const item = await db.inventoryItem.findUnique({ where: { sku } });
  if (item) {
    const reports = await db.damageReport.findMany({
      where: { itemId: item.id },
      select: { id: true },
    });
    await db.photoEvidence.deleteMany({
      where: { reportId: { in: reports.map((r) => r.id) } },
    });
    await db.damageReport.deleteMany({ where: { itemId: item.id } });
    await db.stockTransaction.deleteMany({ where: { itemId: item.id } });
    await db.activityLog.deleteMany({ where: { entityId: item.id } });
    await db.inventoryItem.delete({ where: { id: item.id } });
  }
  await db.activityLog.deleteMany({
    where: { userId: { in: users.map((u) => u.id) } },
  });
  await db.storedFile.deleteMany({
    where: { createdById: { in: users.map((u) => u.id) } },
  });
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await db.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  if (category) await db.category.delete({ where: { id: category.id } });
  if (location) await db.location.delete({ where: { id: location.id } });
  await db.$disconnect();
}
