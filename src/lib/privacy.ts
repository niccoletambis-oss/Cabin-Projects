import { db } from "./db";
import type { Actor } from "./permissions";
import { verifyPassword } from "./security";
import { ApplicationError } from "./application-error";
export async function setBookingPrivacy(
  actor: Actor,
  id: string,
  password: string,
  action: "archive" | "restore" | "hold" | "release",
) {
  if (actor.role !== "ADMIN") throw new ApplicationError("Permission denied.");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(password, user.passwordHash)))
    throw new ApplicationError("Current password is incorrect.");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${id} FOR UPDATE`;
    const booking = await tx.booking.findUniqueOrThrow({ where: { id } });
    if (!["CHECKED_OUT", "CANCELLED"].includes(booking.status))
      throw new ApplicationError("Only closed stays can be archived or held.");
    if (action === "archive" && booking.legalHold)
      throw new ApplicationError("A legal hold protects this stay.");
    await tx.booking.update({
      where: { id },
      data:
        action === "hold" || action === "release"
          ? { legalHold: action === "hold" }
          : { privacyArchivedAt: action === "archive" ? new Date() : null },
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "BOOKING_PRIVACY_CHANGED",
        entityId: id,
        details: `Owner confirmed ${action}; historical and financial records retained`,
      },
    });
  });
}
