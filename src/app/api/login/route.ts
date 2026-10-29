import { withApiHeaders } from "@/lib/api-response";
import { publicForm } from "@/lib/public-form";
import { production, sessionHours } from "@/lib/environment";
import {
  enforceRate,
  rateLimitValue,
  clientIdentity,
  RateLimitError,
} from "@/lib/rate-limit";
import { requestId, captureError } from "@/lib/observability";
import { sameOrigin, requestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth-service";
import { SESSION_COOKIE } from "@/lib/auth";
import { z } from "zod";
async function handlePOST(request: NextRequest) {
  if (!sameOrigin(request))
    return new NextResponse("Invalid origin", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return new NextResponse("Form too large", { status: 413 });
  let form: FormData;
  try {
    form = await publicForm(request);
  } catch {
    return new NextResponse("Invalid form", { status: 400 });
  }
  const input = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(form.entries()));
  if (!input.success)
    return NextResponse.redirect(
      new URL("/login?error=1", requestOrigin(request)),
      303,
    );
  const id = requestId();
  try {
    await enforceRate(
      "login-ip",
      clientIdentity(request),
      rateLimitValue("RATE_LIMIT_LOGIN_IP", production() ? 30 : 300),
      15 * 60 * 1000,
    );
    const token = await authenticate(input.data.email, input.data.password, {
      requestId: id,
    });
    const response = NextResponse.redirect(
      new URL("/", requestOrigin(request)),
      303,
    );
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: production() || requestOrigin(request).startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: sessionHours() * 60 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof RateLimitError)
      return new Response(error.message, {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfter),
          "X-Request-ID": id,
        },
      });
    if (!(
      error instanceof Error && error.message.startsWith("Invalid credentials")
    ))
      await captureError("login", error, id);
    return NextResponse.redirect(
      new URL("/login?error=1", requestOrigin(request)),
      303,
    );
  }
}

export const POST = withApiHeaders(handlePOST);
