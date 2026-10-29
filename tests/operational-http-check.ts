import "dotenv/config";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
async function untilReady(url: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(url)).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Isolated server did not become ready");
}
async function main() {
  const secret = "OUTAGE_TEST_SECRET_NOT_FOR_LOGS";
  const child = spawn(process.execPath, ["scripts/start.mjs"], {
    env: {
      ...process.env,
      PORT: "3002",
      APP_ENV: "development",
      DATABASE_URL: `postgresql://outage:${secret}@127.0.0.1:1/unreachable`,
      DATABASE_CONNECT_TIMEOUT_MS: "500",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (x) => {
    output += x;
  });
  child.stderr.on("data", (x) => {
    output += x;
  });
  try {
    await untilReady("http://127.0.0.1:3002/api/health/live");
    for (const path of ["/api/health/ready", "/inventory", "/api/files/test"]) {
      const response = await fetch("http://127.0.0.1:3002" + path, {
        headers: { Cookie: "cabin_session=" + "0".repeat(64) },
        redirect: "manual",
      });
      assert.equal(response.status, 503, path);
      const body = await response.text();
      assert.ok(!body.includes(secret));
      assert.ok(!body.includes("postgresql://"));
      assert.match(body, /unavailable/i);
    }
    assert.ok(!output.includes(secret));
    console.info(
      "Outage HTTP check passed: liveness remains healthy; readiness, protected pages and private files fail safely with 503; no database credentials leaked.",
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }
  const invalid = spawn(process.execPath, ["scripts/start.mjs"], {
    env: {
      ...process.env,
      PORT: "3003",
      APP_ENV: "production",
      DATABASE_URL: `postgresql://outage:${secret}@127.0.0.1:1/unreachable`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let invalidOutput = "";
  invalid.stdout.on("data", (x) => {
    invalidOutput += x;
  });
  invalid.stderr.on("data", (x) => {
    invalidOutput += x;
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    invalid.kill("SIGTERM");
  }, 15000);
  const code = await new Promise<number | null>((resolve) =>
    invalid.once("exit", resolve),
  );
  clearTimeout(timer);
  assert.equal(
    timedOut,
    false,
    "Invalid production config must exit by itself",
  );
  assert.ok(typeof code === "number" && code > 0);
  assert.match(invalidOutput, /Invalid server configuration/);
  assert.ok(!invalidOutput.includes(secret));
  console.info(
    "Production startup check passed: missing critical production configuration refuses startup without printing secrets.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Operational verification failed",
  );
  process.exitCode = 1;
});
