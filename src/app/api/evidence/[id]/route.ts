import { withApiHeaders } from "@/lib/api-response";
import { captureError } from "@/lib/observability";
import { GET as storedDownload } from "@/app/api/files/[id]/route";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await currentUser();
    if (!actor) return new Response("Authentication required", { status: 401 });
    const photo = await db.photoEvidence.findUnique({
      where: { id: (await params).id },
      include: { report: { select: { bookingId: true, locationId: true } } },
    });
    if (
      photo?.report.bookingId &&
      actor.role === "CARETAKER" &&
      (!photo.report.locationId ||
        !(await db.locationAssignment.findUnique({
          where: {
            locationId_userId: {
              locationId: photo.report.locationId,
              userId: actor.id,
            },
          },
        })))
    )
      return new Response("Forbidden", { status: 403 });
    if (!photo) return new Response("Not found", { status: 404 });
    if (photo.storedFileId)
      return storedDownload(_request, {
        params: Promise.resolve({ id: photo.storedFileId }),
      });
    return new Response(new Uint8Array(photo.data), {
      headers: {
        "Content-Type": photo.contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const id = await captureError("legacy-evidence", error);
    return new Response(
      `Evidence temporarily unavailable. Please retry. Reference ${id}`,
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = withApiHeaders(handleGET);
