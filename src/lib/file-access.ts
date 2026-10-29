import { db } from "./db";
import { authorize, type Actor } from "./permissions";
import { assertRoom } from "./stay-operations";
import { ApplicationError } from "./application-error";
export async function authorizeFile(actor: Actor, id: string) {
  const file = await db.storedFile.findUnique({
    where: { id },
    include: {
      photos: { include: { report: true } },
      operations: {
        include: {
          inspectionLine: { include: { inspection: true } },
          expense: true,
        },
      },
      privateAttachments: true,
    },
  });
  if (!file || file.state !== "READY")
    throw new ApplicationError("File unavailable.");
  let allowed = false;
  for (const photo of file.photos) {
    if (!photo.report.bookingId || actor.role !== "CARETAKER") {
      allowed = true;
      break;
    }
    try {
      await assertRoom(actor, photo.report.locationId!);
      allowed = true;
    } catch {}
  }
  for (const attachment of file.operations) {
    if (attachment.expense) {
      if (
        actor.role !== "CARETAKER" ||
        attachment.expense.recordedById === actor.id
      )
        allowed = true;
    }
    if (attachment.inspectionLine)
      try {
        await assertRoom(
          actor,
          attachment.inspectionLine.inspection.locationId,
        );
        allowed = true;
      } catch {}
  }
  for (const attachment of file.privateAttachments) {
    try {
      await authorizePrivateParent(actor, attachment);
      allowed = true;
    } catch {}
  }
  if (!allowed) throw new ApplicationError("File unavailable.");
  return file;
}
export type PrivateParent = {
  purchaseId?: string | null;
  bookingId?: string | null;
  locationId?: string | null;
};
export async function authorizePrivateParent(
  actor: Actor,
  parent: PrivateParent,
) {
  if (
    [parent.purchaseId, parent.bookingId, parent.locationId].filter(Boolean)
      .length !== 1
  )
    throw new ApplicationError("Choose one evidence record.");
  if (parent.purchaseId) {
    authorize(actor, "finance");
    await db.purchase.findUniqueOrThrow({ where: { id: parent.purchaseId } });
  }
  if (parent.bookingId) {
    authorize(actor, "booking:view");
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: parent.bookingId },
      include: { rooms: true },
    });
    if (actor.role === "CARETAKER") {
      let assigned = false;
      for (const room of booking.rooms)
        try {
          await assertRoom(actor, room.locationId);
          assigned = true;
        } catch {}
      if (!assigned) throw new ApplicationError("Permission denied.");
    }
  }
  if (parent.locationId) await assertRoom(actor, parent.locationId);
}
