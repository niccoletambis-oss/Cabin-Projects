import { ApplicationError } from "./application-error";
import type { AttachmentInput } from "./stay-operations";
export async function readAttachment(
  value: FormDataEntryValue | null,
  allowPdf = false,
): Promise<AttachmentInput> {
  if (!(value instanceof File) || !value.size || value.size > 2 * 1024 * 1024)
    throw new ApplicationError("Choose a photo or receipt up to 2 MB.");
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      ...(allowPdf ? ["application/pdf"] : []),
    ].includes(value.type)
  )
    throw new ApplicationError(
      "Use JPEG, PNG, WebP or an allowed PDF receipt.",
    );
  return {
    data: new Uint8Array(await value.arrayBuffer()),
    contentType: value.type,
    originalName: value.name,
  };
}
