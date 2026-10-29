import sharp from "sharp";
import { ApplicationError } from "../application-error";
export type UploadInput = {
  data: Uint8Array;
  contentType: string;
  originalName?: string;
};
export async function validateUpload(input: UploadInput, allowPdf = false) {
  const originalSize = input.data.byteLength;
  if (!originalSize || originalSize > 2 * 1024 * 1024)
    throw new ApplicationError("Choose a file up to 2 MB.");
  const originalName = (
    input.originalName ??
    `evidence.${input.contentType === "application/pdf" ? "pdf" : "png"}`
  ).normalize("NFKC");
  if (
    originalName.length > 180 ||
    /[\\/\x00-\x1f\x7f]/.test(originalName) ||
    originalName.includes("..") ||
    /\.(exe|com|bat|cmd|ps1|sh|js|html|svg|php|msi|scr)(\.|$)/i.test(
      originalName,
    )
  )
    throw new ApplicationError("Use a safe photo or receipt filename.");
  const bytes = Buffer.from(input.data);
  if (input.contentType === "application/pdf") {
    if (
      !allowPdf ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      !bytes.subarray(-1024).includes(Buffer.from("%%EOF")) ||
      /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA)\b/i.test(
        bytes.toString("latin1"),
      )
    )
      throw new ApplicationError(
        "Use an image or a non-interactive PDF receipt.",
      );
    return {
      data: bytes,
      contentType: input.contentType,
      originalName,
      originalSize,
    };
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(input.contentType))
    throw new ApplicationError("Use JPEG, PNG or WebP images.");
  try {
    const image = sharp(bytes, { limitInputPixels: 25000000, failOn: "error" });
    const meta = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
      (meta.pages && meta.pages > 1)
    )
      throw new Error("Invalid image");
    const data = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    if (data.length > 2 * 1024 * 1024) throw new Error("Too large");
    return { data, contentType: "image/webp", originalName, originalSize };
  } catch {
    throw new ApplicationError(
      "The photo could not be decoded. Use a valid JPEG, PNG or WebP image.",
    );
  }
}
