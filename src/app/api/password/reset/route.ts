import { withApiHeaders } from "@/lib/api-response";
import { publicForm } from "@/lib/public-form";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin, requestOrigin } from "@/lib/request-origin";
import { completePasswordReset } from "@/lib/password-reset";
import {
  enforceRate,
  clientIdentity,
  rateLimitValue,
  RateLimitError,
} from "@/lib/rate-limit";
import { captureError, requestId } from "@/lib/observability";
import { SESSION_COOKIE } from "@/lib/auth";
async function handlePOST(request: Request) {
  const id = requestId();
  if (!sameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  try {
    await enforceRate(
      "reset-submit",
      clientIdentity(request),
      rateLimitValue("RATE_LIMIT_RESET_SUBMIT", 15),
      15 * 60 * 1000,
    );
    if (Number(request.headers.get("content-length") ?? 0) > 8192)
      return new Response("Invalid form", { status: 400 });
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(15).max(128),
        confirmation: z.string(),
      })
      .refine((v) => v.password === v.confirmation)
      .safeParse(Object.fromEntries((await publicForm(request)).entries()));
    if (!input.success)
      return new Response(
        "The link or password is invalid. Use matching passwords of 15–128 characters.",
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "X-Request-ID": id },
        },
      );
    if (
      !(await completePasswordReset(input.data.token, input.data.password, {
        requestId: id,
      }))
    )
      return new Response(
        "This reset link is invalid, expired or already used. Request a new link.",
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "X-Request-ID": id },
        },
      );
    const response = NextResponse.redirect(
      new URL("/login?reset=1", requestOrigin(request)),
      303,
    );
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    if (error instanceof RateLimitError)
      return new Response(error.message, {
        status: 429,
        headers: { "Retry-After": String(error.retryAfter) },
      });
    await captureError("password_reset_complete", error, id);
    return new Response(
      "Recovery is temporarily unavailable. Please retry or request a new link.",
      { status: 503, headers: { "X-Request-ID": id } },
    );
  }
}

export const POST = withApiHeaders(handlePOST);
