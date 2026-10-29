import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await currentUser()))
    return new Response("Authentication required", { status: 401 });
  const photo = await db.photoEvidence.findUnique({
    where: { id: (await params).id },
  });
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
