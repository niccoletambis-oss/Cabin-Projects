import { requestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { sessionUser } from "@/lib/auth-service";
import { can, type Permission } from "@/lib/permissions";
export async function proxy(request: NextRequest) {
  const user = await sessionUser(request.cookies.get("cabin_session")?.value);
  if (!user)
    return NextResponse.redirect(new URL("/login", requestOrigin(request)));
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
  if (
    request.nextUrl.pathname === "/bookings/new" &&
    !can(user.role, "booking:manage")
  )
    return NextResponse.redirect(new URL("/denied", requestOrigin(request)));
  const permission = restricted[request.nextUrl.pathname.split("/")[1]];
  if (permission && !can(user.role, permission))
    return NextResponse.redirect(new URL("/denied", requestOrigin(request)));
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/",
    "/inventory/:path*",
    "/low-stock/:path*",
    "/transactions/:path*",
    "/audits/:path*",
    "/damage/:path*",
    "/purchases/:path*",
    "/suppliers/:path*",
    "/users/:path*",
    "/activity/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/denied",
    "/rooms/:path*",
    "/linen/:path*",
    "/bookings/:path*",
    "/inspections/:path*",
    "/charges/:path*",
    "/expenses/:path*",
  ],
};
