import "dotenv/config";
import { validateEnvironment, configuredAppUrl } from "../src/lib/environment";
import { fetch, EnvHttpProxyAgent } from "undici";
async function main() {
  if (
    process.env.APP_ENV !== "production" ||
    process.env.DEPLOYMENT_TIER !== "staging" ||
    process.env.STAGING_ACCEPTANCE_CONFIRM !== configuredAppUrl()
  )
    throw new Error("Explicit staging target confirmation required.");
  validateEnvironment();
  const base = configuredAppUrl();
  const agent = new EnvHttpProxyAgent();
  try {
    for (const path of [
      "/api/health/live",
      "/api/health/ready",
      "/login",
      "/forgot-password",
    ]) {
      const response = await fetch(base + path, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (
        response.status !== 200 ||
        !response.headers.get("strict-transport-security") ||
        response.headers.get("x-content-type-options") !== "nosniff"
      )
        throw new Error("Staging HTTPS/header/readiness check failed");
      if (
        path === "/login" &&
        !response.headers
          .get("content-security-policy")
          ?.includes("strict-dynamic")
      )
        throw new Error("Staging CSP check failed");
      await response.body?.cancel();
    }
    console.info(
      JSON.stringify({
        check: "staging_https_and_readiness",
        passed: true,
        launchStatus: "NOT_DETERMINED",
        remaining:
          "Database/bucket isolation, mail delivery, role acceptance, backups, restore, monitoring and Owner sign-off remain manual evidence gates.",
      }),
    );
  } finally {
    await agent.close();
  }
}
main().catch(() => {
  console.error(
    "Staging preflight failed or is not configured. Check production-mode variables, explicit isolated staging target, HTTPS, health and security headers. No credentials are logged.",
  );
  process.exitCode = 1;
});
