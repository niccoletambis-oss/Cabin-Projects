import { db } from "./db";
import type { Actor } from "./permissions";
import { authorizePrivateParent, type PrivateParent } from "./file-access";
import { stageFile, readyFile, discardFile } from "./storage/service";
import type { UploadInput } from "./storage/validation";
import { ApplicationError } from "./application-error";
import { verifyPassword } from "./security";
export async function attachPrivateEvidence(
  actor: Actor,
  parent: PrivateParent,
  upload: UploadInput,
) {
  await authorizePrivateParent(actor, parent);
  const file = await stageFile(actor, upload, !!parent.purchaseId);
  try {
    return await db.$transaction(async (tx) => {
      await authorizePrivateParent(actor, parent);
      const attachment = await tx.privateAttachment.create({
        data: { ...parent, storedFileId: file.id, notes: "" },
      });
      await readyFile(tx, file, actor);
      return attachment;
    });
  } catch (error) {
    await discardFile(file);
    throw error;
  }
}
export async function archiveFile(
  actor: Actor,
  id: string,
  password: string,
  restore = false,
) {
  if (actor.role !== "ADMIN") throw new ApplicationError("Permission denied.");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(password, user.passwordHash)))
    throw new ApplicationError("Current password is incorrect.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StoredFile" WHERE id=${id} FOR UPDATE`;
    const file = await tx.storedFile.findUniqueOrThrow({ where: { id } });
    let protectedEvidence = !!(await tx.photoEvidence.count({
      where: { storedFileId: id },
    }));
    protectedEvidence ||= !!(await tx.operationAttachment.count({
      where: { storedFileId: id },
    }));
    const parents = await tx.privateAttachment.findMany({
      where: { storedFileId: id },
    });
    for (const parent of parents) {
      if (parent.purchaseId) protectedEvidence = true;
      if (parent.bookingId) {
        const b = await tx.booking.findUniqueOrThrow({
          where: { id: parent.bookingId },
        });
        if (b.status !== "CANCELLED" || b.legalHold) protectedEvidence = true;
      }
      if (parent.locationId) {
        const location = await tx.location.findUniqueOrThrow({
          where: { id: parent.locationId },
        });
        if (location.active) protectedEvidence = true;
      }
    }
    if (protectedEvidence)
      throw new ApplicationError(
        "Historical evidence is retained. Only unlinked files or cancelled-stay/inactive-room evidence can be archived.",
      );
    if (!["READY", "ARCHIVED"].includes(file.state))
      throw new ApplicationError("This file is not ready for archive.");
    await tx.storedFile.update({
      where: { id },
      data: {
        state: restore ? "READY" : "ARCHIVED",
        archivedAt: restore ? null : new Date(),
      },
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: restore ? "FILE_RESTORED" : "FILE_ARCHIVED",
        entityId: id,
        details:
          "Owner confirmed private evidence retention change; bytes retained",
      },
    });
  });
}
