import { sameOrigin, requestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth-service";
import { SESSION_COOKIE } from "@/lib/auth";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return new NextResponse("Invalid origin", { status: 403 });
  await destroySession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.redirect(
    new URL("/login", requestOrigin(request)),
    303,
  );
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
