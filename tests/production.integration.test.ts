import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { stayFixture, cleanupStay } from "./stay-fixtures";
import {
  requestPasswordReset,
  completePasswordReset,
} from "../src/lib/password-reset";
import {
  authenticate,
  sessionUser,
  destroySession,
} from "../src/lib/auth-service";
import { tokenHash } from "../src/lib/security";
import { enforceRate, RateLimitError } from "../src/lib/rate-limit";
import {
  attachPrivateEvidence,
  archiveFile,
} from "../src/lib/private-evidence";
import { authorizeFile } from "../src/lib/file-access";
import { fileBytes, stageFile, discardFile } from "../src/lib/storage/service";
import { setBookingPrivacy } from "../src/lib/privacy";
test("Phase 4 recovery, lockout, storage and privacy database safeguards", async (t) => {
  const f = await stayFixture();
  const context = randomUUID();
  try {
    await t.test(
      "reset token hash, expiry, generic unknown delivery, single-use concurrency and all-session revocation",
      async () => {
        const token = await authenticate(f.admin.email, f.password);
        let reset = "";
        await requestPasswordReset(
          f.admin.email,
          (m) => {
            reset = new URL(m.url).searchParams.get("token")!;
          },
          { requestId: context },
        );
        const row = await db.passwordResetToken.findUniqueOrThrow({
          where: { tokenHash: tokenHash(reset) },
        });
        assert.notEqual(row.tokenHash, reset);
        await db.passwordResetToken.update({
          where: { id: row.id },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
        assert.equal(
          await completePasswordReset(reset, "NewFixturePassword2026!"),
          false,
        );
        let unknownDelivered = false;
        assert.equal(
          await requestPasswordReset(
            `${f.prefix}@unknown.invalid`,
            () => {
              unknownDelivered = true;
            },
            { requestId: context },
          ),
          undefined,
        );
        assert.equal(unknownDelivered, false);
        await requestPasswordReset(
          f.admin.email,
          (m) => {
            reset = new URL(m.url).searchParams.get("token")!;
          },
          { requestId: context },
        );
        const results = await Promise.all([
          completePasswordReset(reset, f.password),
          completePasswordReset(reset, f.password),
        ]);
        assert.deepEqual(results.sort(), [false, true]);
        assert.equal(await sessionUser(token), null);
        assert.equal(await completePasswordReset(reset, f.password), false);
      },
    );
    await t.test(
      "stale tokens revoked on reissue and credential changes",
      async () => {
        let first = "",
          second = "";
        await requestPasswordReset(
          f.manager.email,
          (m) => {
            first = new URL(m.url).searchParams.get("token")!;
          },
          { requestId: context },
        );
        await requestPasswordReset(
          f.manager.email,
          (m) => {
            second = new URL(m.url).searchParams.get("token")!;
          },
          { requestId: context },
        );
        assert.equal(await completePasswordReset(first, f.password), false);
        await db.user.update({
          where: { id: f.manager.id },
          data: { passwordHash: null },
        });
        assert.equal(await completePasswordReset(second, f.password), false);
      },
    );
    await t.test(
      "temporary lockout is generic, does not extend while locked and recovers after expiry",
      async () => {
        for (let i = 0; i < 5; i++)
          await assert.rejects(
            authenticate(f.other.email, "wrong-password"),
            /Invalid credentials/,
          );
        const locked = await db.user.findUniqueOrThrow({
          where: { id: f.other.id },
        });
        assert.ok(locked.lockedUntil);
        await assert.rejects(
          authenticate(f.other.email, f.password),
          /Invalid credentials/,
        );
        assert.equal(
          (
            await db.user.findUniqueOrThrow({ where: { id: f.other.id } })
          ).lockedUntil?.getTime(),
          locked.lockedUntil?.getTime(),
        );
        await db.user.update({
          where: { id: f.other.id },
          data: { lockedUntil: new Date(Date.now() - 1) },
        });
        const token = await authenticate(f.other.email, f.password);
        assert.equal((await sessionUser(token))?.id, f.other.id);
        await destroySession(token);
        await destroySession(token);
      },
    );
    await t.test(
      "Postgres limiter increments atomically across simultaneous callers",
      async () => {
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, () =>
            enforceRate("p4-fixture", f.prefix, 3, 60000),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
        assert.equal(
          results.filter(
            (r) =>
              r.status === "rejected" && r.reason instanceof RateLimitError,
          ).length,
          5,
        );
      },
    );
    await t.test(
      "private file metadata, integrity, parent authorization, archive/restore and storage rollback",
      async () => {
        const upload = {
          data: await sharp({
            create: { width: 2, height: 2, channels: 3, background: "white" },
          })
            .png()
            .toBuffer(),
          contentType: "image/png",
          originalName: "room-photo.png",
        };
        const attachment = await attachPrivateEvidence(
          f.caretaker,
          { locationId: f.room.id },
          upload,
        );
        const file = await authorizeFile(f.caretaker, attachment.storedFileId);
        assert.equal(file.createdById, f.caretaker.id);
        assert.equal(file.originalName, "room-photo.png");
        assert.ok((await fileBytes(file)).length > 0);
        await assert.rejects(authorizeFile(f.other, file.id));
        await assert.rejects(
          attachPrivateEvidence(f.other, { locationId: f.room.id }, upload),
        );
        await assert.rejects(
          archiveFile(f.admin, file.id, f.password),
          /retained/,
        );
        const stage = await stageFile(f.admin, upload);
        await discardFile(stage);
        assert.equal(
          (await db.storedFile.findUniqueOrThrow({ where: { id: stage.id } }))
            .state,
          "FAILED",
        );
        await assert.rejects(authorizeFile(f.admin, stage.id));
        await db.location.update({
          where: { id: f.room.id },
          data: { active: false },
        });
        await archiveFile(f.admin, file.id, f.password);
        await assert.rejects(authorizeFile(f.admin, file.id));
        await archiveFile(f.admin, file.id, f.password, true);
        await authorizeFile(f.admin, file.id);
      },
    );
    await t.test(
      "owner privacy archive preserves historical data and respects holds",
      async () => {
        await db.booking.update({
          where: { id: f.booking.id },
          data: { status: "CANCELLED" },
        });
        await assert.rejects(
          setBookingPrivacy(f.caretaker, f.booking.id, f.password, "archive"),
          /Permission/,
        );
        await setBookingPrivacy(f.admin, f.booking.id, f.password, "hold");
        await assert.rejects(
          setBookingPrivacy(f.admin, f.booking.id, f.password, "archive"),
          /hold/,
        );
        await setBookingPrivacy(f.admin, f.booking.id, f.password, "release");
        await setBookingPrivacy(f.admin, f.booking.id, f.password, "archive");
        const b = await db.booking.findUniqueOrThrow({
          where: { id: f.booking.id },
        });
        assert.ok(b.privacyArchivedAt);
        assert.equal(b.guestName, f.booking.guestName);
        await setBookingPrivacy(f.admin, f.booking.id, f.password, "restore");
      },
    );

    await t.test(
      "storage outage leaves no record links and cleans failed staging",
      async () => {
        const upload = {
          data: await sharp({
            create: { width: 2, height: 2, channels: 3, background: "white" },
          })
            .png()
            .toBuffer(),
          contentType: "image/png",
        };
        const before = await db.privateAttachment.count({
          where: { locationId: f.otherRoom.id },
        });
        await assert.rejects(
          stageFile(f.admin, upload, false, {
            async put() {
              throw new Error("Unavailable secret should not log");
            },
            async get() {
              throw new Error("Unavailable");
            },
            async delete() {},
            async health() {},
          }),
          /temporarily unavailable/,
        );
        assert.equal(
          await db.privateAttachment.count({
            where: { locationId: f.otherRoom.id },
          }),
          before,
        );
        const failed = await db.storedFile.findFirstOrThrow({
          where: { createdById: f.admin.id, state: "FAILED" },
          orderBy: { createdAt: "desc" },
        });
        assert.equal(failed.cleanupPending, false);
      },
    );
  } finally {
    await db.privateAttachment.deleteMany({
      where: { storedFile: { createdById: { in: f.users.map((u) => u.id) } } },
    });
    await db.activityLog.deleteMany({ where: { requestId: context } });
    await cleanupStay(f);
    await db.$disconnect();
  }
});
