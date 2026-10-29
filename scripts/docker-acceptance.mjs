// Local artifact verification only: synthetic container configuration, no public ingress or database writes.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const image = process.env.DOCKER_ACCEPTANCE_IMAGE ?? "cabin-operations:phase5";
const network = process.env.DOCKER_ACCEPTANCE_NETWORK;
const host = process.env.DOCKER_ACCEPTANCE_DB_HOST;
const port = Number(process.env.DOCKER_ACCEPTANCE_PORT ?? 3004);
const dockerEnv = { ...process.env };
for (const name of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete dockerEnv[name];
function docker(args, extra = {}) {
  const result = spawnSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", ...args],
    { env: { ...dockerEnv, ...extra }, encoding: "utf8", timeout: 30000 },
  );
  if (result.status !== 0)
    throw new Error(
      "Docker acceptance command failed; inspect isolated container/build logs privately.",
    );
  return args[0] === "logs" ? result.stdout + result.stderr : result.stdout;
}
async function wait(url) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.status === 200) return r;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Docker artifact did not become healthy.");
}
async function main() {
  if (
    process.env.APP_ENV === "production" ||
    !network ||
    !host ||
    !process.env.DATABASE_URL ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error(
      "Configure an isolated LOCAL Docker network, database host and high port; never run against production.",
    );
  const configuration = JSON.parse(docker(["image", "inspect", image]))[0]
    .Config;
  assert.ok(
    configuration.User &&
      configuration.User !== "root" &&
      configuration.User !== "0",
  );
  assert.equal(
    configuration.Env.some((value) =>
      /^(DATABASE_URL|SECURITY_HASH_KEY|SMTP_PASSWORD|FILE_STORAGE_SECRET_KEY)=/.test(
        value,
      ),
    ),
    false,
  );
  const check = docker([
    "run",
    "--rm",
    "--entrypoint",
    "node",
    image,
    "-e",
    "const fs=require('fs');if(process.getuid()===0||fs.readdirSync('/app').some(n=>n.startsWith('.env')))process.exit(1);console.log('nonroot_no_env_files')",
  ]);
  assert.match(check, /nonroot_no_env_files/);
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = host;
  url.port = "5432";
  const env = { DATABASE_URL: url.toString() };
  const name = "cabin-acceptance-" + randomBytes(5).toString("hex");
  const invalid = name + "-invalid";
  try {
    docker(
      [
        "run",
        "-d",
        "--name",
        name,
        "--network",
        network,
        "-p",
        `127.0.0.1:${port}:3000`,
        "-e",
        "APP_ENV=development",
        "-e",
        "DATABASE_URL",
        image,
      ],
      env,
    );
    const base = `http://127.0.0.1:${port}`;
    await wait(base + "/api/health/ready");
    const response = await fetch(base + "/login");
    assert.equal(response.status, 200);
    const html = await response.text();
    const assets = [
      ...html.matchAll(
        /(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^\"]*)?"/g,
      ),
    ].map((match) => match[1]);
    assert.ok(assets.length > 0);
    for (const asset of new Set(assets))
      assert.equal((await fetch(base + asset)).status, 200);
    docker(["run", "-d", "--name", invalid, "-e", "DATABASE_URL", image], env);
    const exit = Number(docker(["wait", invalid]));
    assert.equal(exit, 1);
    const logs = docker(["logs", invalid]);
    assert.match(
      logs,
      /Invalid server configuration|Production database SSL verification is required/,
    );
    assert.ok(!logs.includes(url.password));
    assert.ok(
      !/Ready in/.test(logs),
      "Invalid config must fail before Next starts listening",
    );
    console.info(
      JSON.stringify({
        image,
        nonroot: true,
        noEmbeddedRuntimeCredentials: true,
        noRootEnvFiles: true,
        liveness: (await fetch(base + "/api/health/live")).status === 200,
        readiness: true,
        staticAssets: true,
        missingProductionConfigRefused: true,
        fullProductionInfrastructure: "UNVERIFIED",
      }),
    );
  } finally {
    for (const owned of [name, invalid])
      spawnSync(
        "docker",
        ["--host=unix:///var/run/docker.sock", "rm", "-f", owned],
        { env: dockerEnv, stdio: "ignore" },
      );
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Docker acceptance failed.",
  );
  process.exitCode = 1;
});
