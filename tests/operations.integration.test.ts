import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
import {
  authenticate,
  sessionUser,
  destroySession,
} from "../src/lib/auth-service";
import { createItem, moveStock } from "../src/lib/inventory";
import * as ops from "../src/lib/operations";
test("Phase 2 PostgreSQL workflows and security", async (t) => {
  const suffix = randomUUID().slice(0, 12);
  const password = "IntegrationPassword2026!";
  const passwordHash = await hashPassword(password);
  const [admin, manager, caretaker] = await Promise.all(
    (["ADMIN", "MANAGER", "CARETAKER"] as const).map((role) =>
      db.user.create({
        data: {
          name: `Test ${role}`,
          email: `${role}-${suffix}@test.invalid`.toLowerCase(),
          role,
          passwordHash,
        },
      }),
    ),
  );
  const category = await db.category.create({
    data: { name: `Test category ${suffix}` },
  });
  const location = await db.location.create({
    data: { name: `Test location ${suffix}` },
  });
  const users = [admin.id, manager.id, caretaker.id];
  const items: string[] = [];
  const suppliers: string[] = [];
  const purchases: string[] = [];
  const audits: string[] = [];
  const reports: string[] = [];
  try {
    await t.test(
      "login, session hashing, logout and inactive account rejection",
      async () => {
        await assert.rejects(authenticate(admin.email, "wrong password"));
        const token = await authenticate(admin.email, password);
        assert.equal((await sessionUser(token))?.role, "ADMIN");
        const stored = await db.session.findFirstOrThrow({
          where: { userId: admin.id },
        });
        assert.notEqual(stored.tokenHash, token);
        await destroySession(token);
        assert.equal(await sessionUser(token), null);
        await db.user.update({
          where: { id: caretaker.id },
          data: { active: false },
        });
        await assert.rejects(authenticate(caretaker.email, password));
        await db.user.update({
          where: { id: caretaker.id },
          data: { active: true },
        });
      },
    );
    await t.test(
      "Admin user management, password resets and session revocation",
      async () => {
        await assert.rejects(ops.saveUser(manager, {}), /Permission/);
        const user = await ops.saveUser(admin, {
          name: "New test user",
          email: `extra-${suffix}@test.invalid`,
          role: "CARETAKER",
          active: true,
          password,
        });
        users.push(user.id);
        const token = await authenticate(user.email, password);
        await ops.saveUser(admin, {
          id: user.id,
          name: user.name,
          email: user.email,
          role: "MANAGER",
          active: true,
          password: "ChangedPassword2026!",
        });
        assert.equal(await sessionUser(token), null);
        await assert.rejects(authenticate(user.email, password));
        const updatedToken = await authenticate(
          user.email,
          "ChangedPassword2026!",
        );
        await destroySession(updatedToken);
        await assert.rejects(
          ops.saveUser(admin, {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: "CARETAKER",
            active: true,
          }),
          /own account/,
        );
      },
    );
    const supplier = await ops.saveSupplier(manager, {
      name: `Test supplier ${suffix}`,
      contactPerson: "Contact",
      phone: "09123456789",
      email: "supply@example.invalid",
      address: "Test address",
      notes: "Test supplier",
      active: true,
    });
    suppliers.push(supplier.id);
    const data = {
      name: "Operations test towels",
      sku: `OPS-${suffix}`,
      unit: "pcs",
      quantity: 10,
      minimumStock: 4,
      unitCost: 100,
      categoryId: category.id,
      locationId: location.id,
    };
    const item = await createItem(manager, data);
    items.push(item.id);
    const second = await createItem(admin, {
      ...data,
      name: "Second test item",
      sku: `OPS2-${suffix}`,
    });
    items.push(second.id);
    await t.test(
      "Caretaker cannot add/edit inventory or manage suppliers; stock remains usable",
      async () => {
        await assert.rejects(createItem(caretaker, data), /Permission/);
        await assert.rejects(ops.editItem(caretaker, {}), /Permission/);
        await assert.rejects(ops.saveSupplier(caretaker, {}), /Permission/);
        await moveStock(caretaker, {
          itemId: item.id,
          type: "IN",
          quantity: 2,
          note: "Caretaker received",
        });
        await moveStock(caretaker, {
          itemId: item.id,
          type: "OUT",
          quantity: 2,
          note: "Caretaker room supplies",
        });
        await assert.rejects(
          moveStock(caretaker, {
            itemId: item.id,
            type: "OUT",
            quantity: 11,
            note: "Too many",
          }),
          /Not enough/,
        );
        await assert.rejects(
          db.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: -1 },
          }),
        );
      },
    );
    await t.test(
      "editing item metadata preserves stock and transaction history",
      async () => {
        const before = await db.stockTransaction.count({
          where: { itemId: item.id },
        });
        await ops.editItem(manager, {
          ...data,
          id: item.id,
          description: "Updated description",
          brand: "Cabin",
          reorderQuantity: 8,
          supplierId: supplier.id,
          condition: "FAIR",
          status: "ACTIVE",
          datePurchased: null,
          notes: "Updated notes",
          quantity: 999,
        });
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .quantity,
          10,
        );
        assert.equal(
          await db.stockTransaction.count({ where: { itemId: item.id } }),
          before,
        );
      },
    );
    await t.test(
      "Caretaker damage report with evidence; only management can review costs/status",
      async () => {
        const report = await ops.createDamage(
          caretaker,
          {
            itemId: item.id,
            type: "MISSING",
            quantity: 1,
            locationId: location.id,
            description: "Missing during room check",
          },
          {
            data: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
              "base64",
            ),
            contentType: "image/png",
          },
        );
        reports.push(report.id);
        await assert.rejects(ops.reviewDamage(caretaker, {}), /Permission/);
        await assert.rejects(
          ops.createDamage(caretaker, {
            itemId: item.id,
            type: "DAMAGE",
            quantity: 1,
            locationId: location.id,
            description: "Test",
            estimatedCost: 30,
          }),
          /Permission/,
        );
        await ops.reviewDamage(manager, {
          id: report.id,
          status: "FOR_REPLACEMENT",
          estimatedCost: 100,
          managementRemarks: "Replace after review",
        });
        assert.equal(
          (
            await db.damageReport.findUniqueOrThrow({
              where: { id: report.id },
            })
          ).status,
          "FOR_REPLACEMENT",
        );
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .quantity,
          10,
        );
      },
    );
    await t.test(
      "assigned audit counts do not change stock until Manager review",
      async () => {
        const audit = await ops.startAudit(
          manager,
          location.id,
          "Assigned caretaker check",
          caretaker.id,
        );
        audits.push(audit.id);
        const lines = await db.auditLine.findMany({
          where: { auditId: audit.id },
        });
        await ops.completeAudit(
          caretaker,
          audit.id,
          lines.map((l) => ({
            id: l.id,
            countedQuantity: l.itemId === item.id ? 9 : l.expectedQuantity,
            condition: "GOOD",
            remarks: "Counted physically",
          })),
        );
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .quantity,
          10,
        );
        await assert.rejects(
          ops.reviewAudit(caretaker, audit.id, "Not allowed", true),
          /Permission/,
        );
        await ops.reviewAudit(
          manager,
          audit.id,
          "Verified one missing towel",
          true,
        );
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .quantity,
          9,
        );
        await assert.rejects(
          ops.reviewAudit(manager, audit.id, "Duplicate adjustment", true),
          /awaiting review/,
        );
      },
    );
    await t.test(
      "audit adjustment rejects stale stock and rolls back review",
      async () => {
        const audit = await ops.startAudit(
          caretaker,
          location.id,
          "Stale audit",
        );
        audits.push(audit.id);
        const lines = await db.auditLine.findMany({
          where: { auditId: audit.id },
        });
        await ops.completeAudit(
          caretaker,
          audit.id,
          lines.map((l) => ({
            id: l.id,
            countedQuantity: l.expectedQuantity,
            condition: "GOOD",
            remarks: "Counted",
          })),
        );
        await moveStock(caretaker, {
          itemId: item.id,
          type: "IN",
          quantity: 1,
          note: "After audit snapshot",
        });
        await assert.rejects(
          ops.reviewAudit(admin, audit.id, "Attempt stale adjustment", true),
          /changed since audit/,
        );
        assert.equal(
          (
            await db.inventoryAudit.findUniqueOrThrow({
              where: { id: audit.id },
            })
          ).status,
          "FOR_REVIEW",
        );
        await ops.reviewAudit(
          manager,
          audit.id,
          "Review only; follow-up needed",
          false,
        );
      },
    );
    const purchase = await ops.createPurchase(manager, {
      supplierId: supplier.id,
      notes: "Test order",
      status: "FOR_APPROVAL",
      lines: [{ itemId: item.id, quantity: 3, unitCost: 100 }],
    });
    purchases.push(purchase.id);
    await t.test(
      "purchase approval is Admin-only and receiving requires approval",
      async () => {
        await assert.rejects(ops.createPurchase(caretaker, {}), /Permission/);
        await assert.rejects(
          ops.transitionPurchase(manager, purchase.id, "APPROVED"),
          /Permission/,
        );
        await assert.rejects(
          ops.transitionPurchase(manager, purchase.id, "RECEIVED"),
          /status/,
        );
        await ops.transitionPurchase(admin, purchase.id, "APPROVED");
      },
    );
    await t.test(
      "concurrent receiving applies stock and logs exactly once",
      async () => {
        const before = (
          await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
        ).quantity;
        const result = await Promise.allSettled([
          ops.transitionPurchase(manager, purchase.id, "RECEIVED"),
          ops.transitionPurchase(admin, purchase.id, "RECEIVED"),
        ]);
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .quantity,
          before + 3,
        );
        const received = await db.purchase.findUniqueOrThrow({
          where: { id: purchase.id },
        });
        assert.ok(received.receivedAt);
        assert.ok(received.receivedById);
        assert.equal(
          await db.stockTransaction.count({
            where: { note: `Received ${purchase.reference}` },
          }),
          1,
        );
        assert.equal(
          await db.activityLog.count({
            where: { entityId: purchase.id, action: "PURCHASE_RECEIVED" },
          }),
          1,
        );
        await assert.rejects(
          ops.transitionPurchase(admin, purchase.id, "RECEIVED"),
        );
      },
    );
    await t.test(
      "failed multi-line receiving rolls back all stock, logs and request state",
      async () => {
        const request = await ops.createPurchase(manager, {
          supplierId: supplier.id,
          notes: "Rollback order",
          status: "FOR_APPROVAL",
          lines: [
            { itemId: item.id, quantity: 1, unitCost: 100 },
            { itemId: second.id, quantity: 1, unitCost: 100 },
          ],
        });
        purchases.push(request.id);
        await ops.transitionPurchase(admin, request.id, "APPROVED");
        await db.inventoryItem.update({
          where: { id: second.id },
          data: { quantity: 1000000 },
        });
        const before = (
          await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
        ).quantity;
        await assert.rejects(
          ops.transitionPurchase(manager, request.id, "RECEIVED"),
          /rolled back/,
        );
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .quantity,
          before,
        );
        assert.equal(
          (await db.purchase.findUniqueOrThrow({ where: { id: request.id } }))
            .status,
          "APPROVED",
        );
        assert.equal(
          await db.stockTransaction.count({
            where: { note: `Received ${request.reference}` },
          }),
          0,
        );
      },
    );
    await t.test(
      "supplier archiving preserves purchase history and blocks new requests",
      async () => {
        await ops.saveSupplier(admin, {
          id: supplier.id,
          name: supplier.name,
          contactPerson: "Contact",
          phone: "",
          email: "",
          address: "",
          notes: "Archived",
          active: false,
        });
        assert.equal(
          await db.purchase.count({ where: { supplierId: supplier.id } }),
          2,
        );
        await assert.rejects(
          ops.createPurchase(manager, {
            supplierId: supplier.id,
            notes: "No",
            status: "DRAFT",
            lines: [{ itemId: item.id, quantity: 1, unitCost: 1 }],
          }),
          /archived/,
        );
      },
    );
    await t.test(
      "important actions are attributed in the activity log",
      async () => {
        const logs = await db.activityLog.findMany({
          where: { userId: { in: users } },
        });
        for (const action of [
          "LOGIN",
          "LOGOUT",
          "USER_CREATED",
          "USER_UPDATED",
          "ITEM_CREATED",
          "ITEM_UPDATED",
          "STOCK_IN",
          "STOCK_OUT",
          "DAMAGE_REPORTED",
          "DAMAGE_REVIEWED",
          "AUDIT_STARTED",
          "AUDIT_COMPLETED",
          "INVENTORY_ADJUSTMENT",
          "PURCHASE_REQUEST",
          "PURCHASE_APPROVED",
          "PURCHASE_RECEIVED",
          "SUPPLIER_CHANGED",
        ])
          assert.ok(
            logs.some((l) => l.action === action && l.role),
            action,
          );
      },
    );
  } finally {
    await db.photoEvidence.deleteMany({ where: { reportId: { in: reports } } });
    await db.damageReport.deleteMany({ where: { id: { in: reports } } });
    await db.auditLine.deleteMany({ where: { auditId: { in: audits } } });
    await db.inventoryAudit.deleteMany({ where: { id: { in: audits } } });
    await db.purchaseLine.deleteMany({
      where: { purchaseId: { in: purchases } },
    });
    await db.purchase.deleteMany({ where: { id: { in: purchases } } });
    await db.stockTransaction.deleteMany({ where: { itemId: { in: items } } });
    await db.inventoryItem.deleteMany({ where: { id: { in: items } } });
    await db.supplier.deleteMany({ where: { id: { in: suppliers } } });
    await db.activityLog.deleteMany({ where: { userId: { in: users } } });
    await db.storedFile.deleteMany({ where: { createdById: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.category.delete({ where: { id: category.id } });
    await db.location.delete({ where: { id: location.id } });
    await db.$disconnect();
  }
});
