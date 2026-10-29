export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvironment } = await import("./lib/environment");
    validateEnvironment();
  }
}
export async function onRequestError(error: unknown) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureError } = await import("./lib/observability");
    await captureError("request-failed", error);
  } else {
    // Edge builds must not bundle Node crypto, SMTP or Undici modules.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        severity: "error",
        requestId: crypto.randomUUID(),
        context: "edge-request-failed",
        errorType: error instanceof Error ? "Error" : "UnknownError",
      }),
    );
  }
}
