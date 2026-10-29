import { requestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { sessionUser } from "@/lib/auth-service";
import { can, type Permission } from "@/lib/permissions";
import { securityHeaders } from "@/lib/security-headers";
import { randomBytes } from "node:crypto";
import { captureError, requestId } from "@/lib/observability";
export async function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString("base64");
  const id = requestId();
  const security = securityHeaders(nonce);
  const finish = (response: NextResponse) => {
    for (const [key, value] of Object.entries(security))
      response.headers.set(key, value);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Request-Id", id);
    return response;
  };
  try {
    const path = request.nextUrl.pathname;
    const incoming = new Headers(request.headers);
    incoming.set("x-nonce", nonce);
    incoming.set("x-request-id", id);
    incoming.set(
      "Content-Security-Policy",
      security["Content-Security-Policy"],
    );
    if (["/login", "/forgot-password", "/reset-password"].includes(path))
      return finish(NextResponse.next({ request: { headers: incoming } }));
    const user = await sessionUser(request.cookies.get("cabin_session")?.value);
    if (!user)
      return finish(
        NextResponse.redirect(new URL("/login", requestOrigin(request))),
      );
    const restricted: Record<string, Permission> = {
      users: "users",
      rooms: "rooms:view",
      linen: "linen",
      bookings: "booking:view",
      inspections: "inspection",
      charges: "charge:review",
      expenses: "expense:submit",
      suppliers: "suppliers",
      purchases: "purchase:create",
      activity: "logs",
      reports: "reports",
    };
    const permission = restricted[path.split("/")[1]];
    if (
      (path === "/bookings/new" && !can(user.role, "booking:manage")) ||
      (permission && !can(user.role, permission))
    )
      return finish(
        NextResponse.redirect(new URL("/denied", requestOrigin(request))),
      );
    return finish(NextResponse.next({ request: { headers: incoming } }));
  } catch (error) {
    await captureError("request-authentication", error, id);
    return finish(
      new NextResponse(
        `Temporarily unavailable. Please retry. Reference ${id}`,
        { status: 503 },
      ),
    );
  }
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)",
  ],
};
