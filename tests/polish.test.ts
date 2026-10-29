import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageNumber, pageQuery } from "../src/lib/pagination";
import { manilaMonthRange } from "../src/lib/expense-summary";
import { staffMessage } from "../src/lib/staff-message";
import { storageCanary } from "../src/lib/storage/acceptance";
import { statusTone } from "../src/components/status-badge";
test("history pages reject fractions, arrays and malicious values and bound query size", () => {
  for (const value of [undefined, ["2"], "2.5", "Infinity", "-1", "1e3", "bad"])
    assert.equal(pageNumber(value), 1);
  assert.equal(pageNumber("999999"), 10000);
  assert.deepEqual(pageQuery(2), { skip: 50, take: 51 });
});
test("Manila monthly ranges include leap days and exclude next month without UTC date drift", () => {
  const r = manilaMonthRange(new Date("2028-02-29T15:59:59Z"));
  assert.equal(r.month, "2028-02");
  assert.equal(r.gte.toISOString(), "2028-01-31T16:00:00.000Z");
  assert.equal(r.lt.toISOString(), "2028-02-29T16:00:00.000Z");
  assert.equal(
    manilaMonthRange(new Date("2028-02-29T16:00:00Z")).month,
    "2028-03",
  );
});
test("staff feedback and status tones preserve meaning without relying on color", () => {
  assert.match(staffMessage("Permission denied"), /don’t have permission/);
  assert.equal(staffMessage("Not enough stock"), "Not enough stock");
  assert.equal(statusTone("CANCELLED"), "neutral");
  assert.equal(statusTone("REJECTED"), "empty");
  assert.equal(statusTone("RECEIVED"), "good");
});
test("storage acceptance harness checks integrity and private access and deletes only its canary", async () => {
  let stored: Uint8Array | undefined,
    deleted = false;
  const adapter = {
    async health() {},
    async put(file: { objectKey: string }, data: Uint8Array) {
      assert.match(file.objectKey, /^evidence\/acceptance-/);
      stored = data;
      return "version";
    },
    async get() {
      return stored!;
    },
    async delete() {
      stored = undefined;
      deleted = true;
    },
  };
  const result = await storageCanary(
    adapter,
    Buffer.from("canary"),
    async () => ({ encrypted: true, versioned: true }),
    async () => 403,
  );
  assert.equal(result.integrity, true);
  assert.equal(deleted, true);
  deleted = false;
  await assert.rejects(
    storageCanary(
      adapter,
      Buffer.from("canary"),
      async () => ({ encrypted: true, versioned: true }),
      async () => 200,
    ),
    /Anonymous/,
  );
  assert.equal(deleted, true);
});

test("staging acceptance commands refuse unconfirmed targets before any provider action", async () => {
  const { spawnSync } = await import("node:child_process");
  for (const file of [
    "scripts/staging-preflight.ts",
    "scripts/staging-storage.ts",
  ]) {
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", file],
      {
        env: {
          ...process.env,
          APP_ENV: "test",
          DEPLOYMENT_TIER: "staging",
          STAGING_ACCEPTANCE_CONFIRM: "",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /failed or is not configured/);
    assert.ok(!result.stderr.includes("postgresql://"));
  }
});
