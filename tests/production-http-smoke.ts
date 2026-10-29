import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { stayFixture, cleanupStay } from "./stay-fixtures";
import { requestPasswordReset } from "../src/lib/password-reset";
const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
async function main() {
  const f = await stayFixture();
  const id = randomUUID();
  const post = (path: string, data: Record<string, string>, origin = base) =>
    fetch(base + path, {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams(data),
      redirect: "manual",
    });
  try {
    for (const path of [
      "/api/health",
      "/api/health/live",
      "/api/health/ready",
    ]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200);
      assert.ok(["ok", "ready"].includes((await r.json()).status));
      assert.equal(r.headers.get("cache-control"), "private, no-store");
    }
    const login = await fetch(base + "/login");
    const csp = login.headers.get("content-security-policy")!;
    assert.match(csp, /nonce-[^']+/);
    assert.ok(!csp.includes("unsafe-inline"));
    assert.equal(login.headers.get("referrer-policy"), "strict-origin");
    assert.equal(login.headers.get("x-frame-options"), "DENY");
    assert.notEqual(
      csp,
      (await fetch(base + "/login")).headers.get("content-security-policy"),
    );
    assert.equal((await fetch(base + "/api/files/nonexistent")).status, 401);
    assert.equal(
      (
        await post(
          "/api/password/forgot",
          { email: f.admin.email },
          "https://attacker.invalid",
        )
      ).status,
      403,
    );
    const known = await post("/api/password/forgot", { email: f.admin.email }),
      unknown = await post("/api/password/forgot", {
        email: `${id}@unknown.invalid`,
      });
    assert.equal(known.status, 303);
    assert.equal(
      known.headers.get("location"),
      unknown.headers.get("location"),
    );
    let reset = "";
    await requestPasswordReset(f.admin.email, (m) => {
      reset = new URL(m.url).searchParams.get("token")!;
    });
    const auth = await post("/api/login", {
      email: f.admin.email,
      password: f.password,
    });
    const cookie = auth.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
    const result = await post("/api/password/reset", {
      token: reset,
      password: f.password,
      confirmation: f.password,
    });
    assert.equal(result.status, 303);
    assert.equal(
      (
        await post("/api/password/reset", {
          token: reset,
          password: f.password,
          confirmation: f.password,
        })
      ).status,
      400,
    );
    const expired = await fetch(base + "/", {
      headers: { Cookie: cookie.split(";")[0] },
      redirect: "manual",
    });
    assert.equal(expired.status, 307);
    assert.ok(expired.headers.get("location")?.endsWith("/login"));
    console.info(
      "Phase 4 HTTP smoke passed: liveness/readiness, nonce CSP, safe referrers, CSRF rejection, generic recovery, single-use reset, session revocation and private files.",
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
