import { withApiHeaders } from "@/lib/api-response";
import { currentUser } from "@/lib/auth";
import { authorizeFile } from "@/lib/file-access";
import { fileBytes, downloadResponse } from "@/lib/storage/service";
import { db } from "@/lib/db";
import {
  ApplicationError,
  StorageUnavailableError,
} from "@/lib/application-error";
import { captureError } from "@/lib/observability";
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await currentUser();
    if (!actor) return new Response("Authentication required", { status: 401 });
    const file = await authorizeFile(actor, (await params).id);
    const bytes = await fileBytes(file);
    await db.activityLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "FILE_ACCESSED",
        entityId: file.id,
        details: "Private evidence accessed",
      },
    });
    return downloadResponse(bytes, file.contentType);
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      !(error instanceof StorageUnavailableError)
    )
      return new Response("Not found", { status: 404 });
    const id = await captureError("private-file", error);
    return new Response(
      `Private file temporarily unavailable. Reference ${id}`,
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = withApiHeaders(handleGET);
