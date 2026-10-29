// Use the browser-facing Host, since Next's internal route URL may use localhost.
// Deployments behind TLS termination should explicitly set APP_ORIGIN.
export function requestOrigin(request: Request) {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  const protocol = new URL(request.url).protocol;
  const host = request.headers.get("host");
  if (!host || /[\s/@\\]/.test(host)) throw new Error("Invalid request host");
  return new URL(`${protocol}//${host}`).origin;
}
export function sameOrigin(request: Request) {
  try {
    return request.headers.get("origin") === requestOrigin(request);
  } catch {
    return false;
  }
}
