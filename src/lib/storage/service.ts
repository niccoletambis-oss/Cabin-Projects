import { randomUUID, createHash } from "node:crypto";
import type { Prisma, StoredFile } from "@prisma/client";
import { db } from "../db";
import { storageProvider, type ObjectStorage } from "./provider";
import { validateUpload, type UploadInput } from "./validation";
import { enforceRate, rateLimitValue } from "../rate-limit";
import { captureError } from "../observability";
import { StorageUnavailableError } from "../application-error";
export async function stageFile(
  actor: { id: string },
  input: UploadInput,
  allowPdf = false,
  adapter?: ObjectStorage,
) {
  await enforceRate(
    "upload",
    actor.id,
    rateLimitValue("RATE_LIMIT_UPLOAD", 60),
    300000,
  );
  const normalized = await validateUpload(input, allowPdf);
  const id = randomUUID();
  const file = await db.storedFile.create({
    data: {
      id,
      objectKey: `evidence/${id}`,
      provider: process.env.FILE_STORAGE_PROVIDER === "s3" ? "S3" : "DATABASE",
      originalName: normalized.originalName,
      contentType: normalized.contentType,
      size: normalized.data.length,
      originalSize: normalized.originalSize,
      sha256: createHash("sha256").update(normalized.data).digest("hex"),
      createdById: actor.id,
    },
  });
  try {
    const storageVersion = await (
      adapter ?? storageProvider(file.provider)
    ).put(file, normalized.data);
    return await db.storedFile.update({
      where: { id },
      data: { storageVersion },
    });
  } catch (error) {
    await discardFile(file, adapter);
    await captureError("file-upload", error);
    throw new StorageUnavailableError();
  }
}
export async function readyFile(
  tx: Prisma.TransactionClient,
  file: StoredFile,
  actor: { id: string; role: "ADMIN" | "MANAGER" | "CARETAKER" },
) {
  const result = await tx.storedFile.updateMany({
    where: { id: file.id, state: "STAGED" },
    data: { state: "READY" },
  });
  if (result.count !== 1) throw new StorageUnavailableError();
  await tx.activityLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action: "FILE_UPLOADED",
      entityId: file.id,
      details: "Private evidence stored; content excluded from logs",
    },
  });
}
export async function discardFile(file: StoredFile, adapter?: ObjectStorage) {
  // Never delete a READY object after an ambiguous transaction result.
  try {
    const claim = await db.storedFile.updateMany({
      where: { id: file.id, state: { in: ["STAGED", "FAILED"] } },
      data: { state: "FAILED", cleanupPending: true },
    });
    if (!claim.count) return;
    await (adapter ?? storageProvider(file.provider)).delete(file);
    await db.storedFile.update({
      where: { id: file.id },
      data: { cleanupPending: false },
    });
  } catch (error) {
    await captureError("file-cleanup-pending", error);
  }
}
export async function fileBytes(file: StoredFile) {
  try {
    const data = await storageProvider(file.provider).get(file);
    if (
      data.byteLength !== file.size ||
      createHash("sha256").update(data).digest("hex") !== file.sha256
    )
      throw new Error("Integrity check failed");
    return data;
  } catch (error) {
    await captureError("file-download", error);
    throw new StorageUnavailableError();
  }
}
export function downloadResponse(data: Uint8Array, contentType: string) {
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition":
        contentType === "application/pdf"
          ? 'attachment; filename="receipt.pdf"'
          : "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
