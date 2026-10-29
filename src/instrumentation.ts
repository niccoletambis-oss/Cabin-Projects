export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvironment } = await import("./lib/environment");
    validateEnvironment();
  }
}
export async function onRequestError(error: unknown) {
  const { captureError } = await import("./lib/observability");
  await captureError("request-failed", error);
}
