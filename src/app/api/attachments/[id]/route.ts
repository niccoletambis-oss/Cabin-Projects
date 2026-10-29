import { withApiHeaders } from "@/lib/api-response";
import { captureError } from "@/lib/observability";
import { GET as storedDownload } from "@/app/api/files/[id]/route";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertRoom } from "@/lib/stay-operations";
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await currentUser();
    if (!actor) return new Response("Authentication required", { status: 401 });
    const attachment = await db.operationAttachment.findUnique({
      where: { id: (await params).id },
      include: {
        inspectionLine: {
          select: { inspection: { select: { locationId: true } } },
        },
        expense: { select: { recordedById: true } },
      },
    });
    if (!attachment) return new Response("Not found", { status: 404 });
    if (attachment.inspectionLine) {
      try {
        await assertRoom(
          actor,
          attachment.inspectionLine.inspection.locationId,
        );
      } catch {
        return new Response("Forbidden", { status: 403 });
      }
    }
    if (
      attachment.expense &&
      actor.role === "CARETAKER" &&
      attachment.expense.recordedById !== actor.id
    )
      return new Response("Forbidden", { status: 403 });
    if (attachment.storedFileId)
      return storedDownload(_request, {
        params: Promise.resolve({ id: attachment.storedFileId }),
      });
    return new Response(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition":
          attachment.contentType === "application/pdf"
            ? 'attachment; filename="receipt.pdf"'
            : "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
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
