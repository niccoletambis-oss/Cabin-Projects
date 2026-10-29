import { sameOrigin, requestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth-service";
import { SESSION_COOKIE } from "@/lib/auth";
import { z } from "zod";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return new NextResponse("Invalid origin", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return new NextResponse("Form too large", { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
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
  try {
    const token = await authenticate(input.data.email, input.data.password);
    const response = NextResponse.redirect(
      new URL("/", requestOrigin(request)),
      303,
    );
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: requestOrigin(request).startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=1", requestOrigin(request)),
      303,
    );
  }
}
