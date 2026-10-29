import { test } from "node:test";
import assert from "node:assert/strict";
import {
  can,
  authorize,
  hashPassword,
  verifyPassword,
} from "../src/lib/security";
import {
  stockLevel,
  suggestedOrder,
  auditFlag,
} from "../src/lib/inventory-status";
test("server authorization matrix rejects anonymous and restricts each role", () => {
  assert.throws(() => authorize(null, "stock"), /Authentication/);
  for (const permission of [
    "users",
    "inventory:edit",
    "stock",
    "suppliers",
    "purchase:create",
    "purchase:approve",
    "purchase:receive",
    "audit",
    "review",
    "reports",
    "logs",
    "finance",
  ] as const) {
    assert.equal(can("ADMIN", permission), true);
    assert.equal(
      can("MANAGER", permission),
      !["users", "purchase:approve"].includes(permission),
    );
    assert.equal(
      can("CARETAKER", permission),
      ["stock", "audit"].includes(permission),
    );
  }
  assert.throws(
    () => authorize({ id: "x", name: "x", role: "CARETAKER" }, "finance"),
    /Permission/,
  );
});
test("scrypt uses unique salts, verifies passwords and rejects weak passwords", async () => {
  const hash = await hashPassword("StrongTestPassword!");
  assert.notEqual(hash, await hashPassword("StrongTestPassword!"));
  assert.equal(await verifyPassword("StrongTestPassword!", hash), true);
  assert.equal(await verifyPassword("WrongPassword!", hash), false);
  assert.equal(await verifyPassword("WrongPassword!", null), false);
  await assert.rejects(hashPassword("short"));
});
test("stock levels, suggested orders and audit flags reflect inventory controls", () => {
  assert.equal(stockLevel(0, 5), "OUT OF STOCK");
  assert.equal(stockLevel(2, 10), "CRITICAL");
  assert.equal(stockLevel(8, 10), "LOW STOCK");
  assert.equal(stockLevel(11, 10), "NORMAL");
  assert.equal(stockLevel(1, 0), "NORMAL");
  assert.equal(suggestedOrder(1, 10, 5), 10);
  assert.equal(auditFlag(5, 5, "GOOD"), "Complete");
  assert.equal(auditFlag(5, 4, "GOOD"), "Shortage");
  assert.equal(auditFlag(5, 6, "GOOD"), "Excess");
  assert.equal(auditFlag(5, 5, "DAMAGED"), "Damaged");
  assert.equal(auditFlag(5, 0, "GOOD"), "Missing");
});

test("origin validation uses the browser-facing host and rejects cross-origin posts", async () => {
  const { sameOrigin, requestOrigin } =
    await import("../src/lib/request-origin");
  const local = new Request("http://localhost:3000/api/login", {
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  });
  assert.equal(requestOrigin(local), "http://127.0.0.1:3000");
  assert.equal(sameOrigin(local), true);
  assert.equal(
    sameOrigin(
      new Request("http://localhost:3000/api/login", {
        headers: { host: "127.0.0.1:3000", origin: "https://attacker.invalid" },
      }),
    ),
    false,
  );
  assert.equal(
    sameOrigin(
      new Request("http://localhost:3000/api/login", {
        headers: { host: "127.0.0.1:3000" },
      }),
    ),
    false,
  );
});
