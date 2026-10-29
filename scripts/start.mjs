import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
if (existsSync(".env")) process.loadEnvFile(".env");
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: process.env.APP_BIND_HOST ?? "127.0.0.1",
    PORT: process.env.PORT ?? "3000",
  },
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
