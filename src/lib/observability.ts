import { randomUUID, createHash } from "node:crypto";
import { stagingDatabaseDiagnostic } from "./staging-database-diagnostic";
export type SafeEvent = {
  timestamp: string;
  severity: "info" | "warn" | "error";
  requestId: string;
  context: string;
  errorType?: string;
  code?: string;
  fingerprint?: string;
  databaseDiagnostic?: ReturnType<typeof stagingDatabaseDiagnostic>;
};
export type MonitoringSink = { capture(event: SafeEvent): Promise<void> };
const safeName = (value: unknown, fallback: string) =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,64}$/.test(value)
    ? value
    : fallback;
export function requestId(value?: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/.test(value)
    ? value
    : randomUUID();
}
export function safeEvent(
  context: string,
  error?: unknown,
  id?: string,
  severity: SafeEvent["severity"] = "error",
): SafeEvent {
  const event: SafeEvent = {
    timestamp: new Date().toISOString(),
    severity,
    requestId: requestId(id),
    context: safeName(context, "server_error"),
  };
  if (error instanceof Error) {
    event.errorType = safeName(error.constructor.name, "Error");
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string" && /^(P\d{4}|E[A-Z_]{2,30})$/.test(code))
      event.code = code;
    event.fingerprint = createHash("sha256")
      .update(error.stack ?? error.name)
      .digest("hex")
      .slice(0, 16);
  }
  return event;
}
export async function emitEvent(event: SafeEvent, sink?: MonitoringSink) {
  // Never serialize Error, request URL/body, environment, financial values or guest data.
  if (event.severity === "error") console.error(JSON.stringify(event));
  else if (event.severity === "warn") console.warn(JSON.stringify(event));
  else console.info(JSON.stringify(event));
  try {
    if (sink) await sink.capture(event);
    else if (
      process.env.MONITORING_PROVIDER === "webhook" &&
      process.env.MONITORING_WEBHOOK_URL
    ) {
      const { fetch: proxyFetch, EnvHttpProxyAgent } = await import("undici");
      const agent = new EnvHttpProxyAgent();
      try {
        const response = await proxyFetch(process.env.MONITORING_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.MONITORING_TOKEN
              ? { Authorization: `Bearer ${process.env.MONITORING_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(2000),
          dispatcher: agent,
        });
        if (!response.ok) throw new Error("Monitoring delivery failed");
      } finally {
        await agent.close();
      }
    }
  } catch {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        severity: "warn",
        requestId: event.requestId,
        context: "monitoring_delivery_failed",
      }),
    );
  }
}
export async function captureError(
  context: string,
  error: unknown,
  id?: string,
  readinessDatabaseFailure = false,
) {
  const event = safeEvent(context, error, id);
  if (context === "readiness" && readinessDatabaseFailure) {
    const diagnostic = stagingDatabaseDiagnostic(error);
    if (diagnostic) event.databaseDiagnostic = diagnostic;
  }
  await emitEvent(event);
  return event.requestId;
}
