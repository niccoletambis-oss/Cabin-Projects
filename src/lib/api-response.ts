import { production } from "./environment";
import { captureError, requestId } from "./observability";
// Adds response headers only. Every handler retains its own existing authorization/CSRF checks.
export function withApiHeaders<T extends unknown[]>(
  handler: (...args: T) => Response | Promise<Response>,
) {
  return async (...args: T) => {
    const id = requestId();
    let response: Response;
    try {
      response = await handler(...args);
    } catch (error) {
      await captureError("api-request", error, id);
      response = new Response(
        `Service temporarily unavailable. Please retry. Reference ${id}`,
        { status: 503 },
      );
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin");
    response.headers.set("X-Frame-Options", "DENY");
    if (!response.headers.has("Content-Security-Policy"))
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; sandbox",
      );
    if (production())
      response.headers.set("Strict-Transport-Security", "max-age=31536000");
    if (!response.headers.has("X-Request-ID"))
      response.headers.set("X-Request-ID", id);
    return response;
  };
}
