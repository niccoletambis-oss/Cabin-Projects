import { randomUUID, createHash } from "node:crypto";
import type { StoredFile } from "@prisma/client";
import type { ObjectStorage } from "./provider";
export async function storageCanary(
  adapter: ObjectStorage,
  data: Uint8Array,
  inspect: (
    file: StoredFile,
  ) => Promise<{ encrypted: boolean; versioned: boolean }>,
  anonymous: (file: StoredFile) => Promise<number>,
  verifyDeleted?: (file: StoredFile) => Promise<boolean>,
) {
  const id = randomUUID();
  const file: StoredFile = {
    id,
    objectKey: `evidence/acceptance-${id}`,
    provider: "S3",
    state: "STAGED",
    originalName: "acceptance.webp",
    contentType: "image/webp",
    size: data.byteLength,
    originalSize: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
    storageVersion: null,
    data: null,
    createdById: null,
    createdAt: new Date(),
    archivedAt: null,
    cleanupPending: false,
  };
  let attempted = false;
  try {
    await adapter.health();
    attempted = true;
    file.storageVersion = (await adapter.put(file, data)) ?? null;
    const read = await adapter.get(file);
    if (createHash("sha256").update(read).digest("hex") !== file.sha256)
      throw new Error("Storage integrity check failed");
    const metadata = await inspect(file);
    if (!metadata.encrypted || !metadata.versioned)
      throw new Error("Storage encryption/versioning acceptance failed");
    const status = await anonymous(file);
    if (![401, 403, 404].includes(status))
      throw new Error("Anonymous storage request was not denied");
  } finally {
    if (attempted) await adapter.delete(file);
  }
  if (verifyDeleted && !(await verifyDeleted(file)))
    throw new Error("Canary deletion could not be verified");
  return {
    upload: true,
    download: true,
    integrity: true,
    encryption: true,
    versioning: true,
    anonymousDenied: true,
  };
}
