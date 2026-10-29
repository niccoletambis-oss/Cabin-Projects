import { StayError, type AttachmentInput } from "./stay-operations";
export async function readAttachment(
  value: FormDataEntryValue | null,
  allowPdf = false,
): Promise<AttachmentInput> {
  if (!(value instanceof File) || !value.size || value.size > 2 * 1024 * 1024)
    throw new StayError("Choose a photo or receipt up to 2 MB.");
  const bytes = new Uint8Array(await value.arrayBuffer());
  const buffer = Buffer.from(bytes);
  const png = buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP";
  const pdf = allowPdf && buffer.subarray(0, 5).toString() === "%PDF-";
  if (!png && !jpeg && !webp && !pdf)
    throw new StayError(
      allowPdf ? "Use JPEG, PNG, WebP or PDF." : "Use JPEG, PNG or WebP.",
    );
  return {
    data: bytes,
    contentType: png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : webp
          ? "image/webp"
          : "application/pdf",
  };
}
