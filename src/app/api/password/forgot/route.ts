import { withApiHeaders } from "@/lib/api-response";
import { publicForm } from "@/lib/public-form";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { sameOrigin, requestOrigin } from "@/lib/request-origin";
import { requestPasswordReset } from "@/lib/password-reset";
import { sendResetEmail } from "@/lib/email";
import {
  enforceRate,
  clientIdentity,
  rateLimitValue,
  RateLimitError,
} from "@/lib/rate-limit";
import { captureError, requestId } from "@/lib/observability";
async function handlePOST(request: Request) {
  const id = requestId();
  if (!sameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  const start = Date.now();
  try {
    await enforceRate(
      "reset-ip",
      clientIdentity(request),
      rateLimitValue("RATE_LIMIT_RESET_IP", 10),
      15 * 60 * 1000,
    );
    if (Number(request.headers.get("content-length") ?? 0) > 8192)
      return new Response("Invalid form", { status: 400 });
    const form = await publicForm(request);
    const email = z.email().max(254).safeParse(form.get("email"));
    if (email.success)
      await requestPasswordReset(
        email.data,
        (message) => {
          after(async () => {
            try {
              await sendResetEmail(message);
            } catch (error) {
              await captureError("password_reset_delivery", error, id);
            }
          });
        },
        { requestId: id },
      );
  } catch (error) {
    if (error instanceof RateLimitError)
      return new Response(error.message, {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfter),
          "X-Request-ID": id,
        },
      });
    await captureError("password_reset_request", error, id);
  }
  // Delivery runs after the response; use the same response and minimum duration for every account.
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 400 - (Date.now() - start))),
  );
  return NextResponse.redirect(
    new URL("/forgot-password?sent=1", requestOrigin(request)),
    303,
  );
}

export const POST = withApiHeaders(handlePOST);
