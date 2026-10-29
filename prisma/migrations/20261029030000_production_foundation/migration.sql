-- CreateEnum
CREATE TYPE "StoredFileProvider" AS ENUM ('DATABASE', 'S3');

-- CreateEnum
CREATE TYPE "StoredFileState" AS ENUM ('STAGED', 'READY', 'FAILED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyArchivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OperationAttachment" ADD COLUMN     "storedFileId" TEXT;

-- AlterTable
ALTER TABLE "PhotoEvidence" ADD COLUMN     "storedFileId" TEXT;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "provider" "StoredFileProvider" NOT NULL,
    "state" "StoredFileState" NOT NULL DEFAULT 'STAGED',
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageVersion" TEXT,
    "data" BYTEA,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "cleanupPending" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateAttachment" (
    "id" TEXT NOT NULL,
    "storedFileId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "bookingId" TEXT,
    "locationId" TEXT,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "credentialHash" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "keyHash" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("keyHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile"("objectKey");

-- CreateIndex
CREATE INDEX "StoredFile_state_createdAt_idx" ON "StoredFile"("state", "createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_createdById_idx" ON "StoredFile"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_status_checkInDate_idx" ON "Booking"("status", "checkInDate");

-- CreateIndex
CREATE INDEX "DamageReport_status_createdAt_idx" ON "DamageReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DamageReport_bookingId_idx" ON "DamageReport"("bookingId");

-- CreateIndex
CREATE INDEX "Expense_incurredAt_idx" ON "Expense"("incurredAt");

-- CreateIndex
CREATE INDEX "Expense_recordedById_incurredAt_idx" ON "Expense"("recordedById", "incurredAt");

-- CreateIndex
CREATE INDEX "GuestCharge_status_createdAt_idx" ON "GuestCharge"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");

-- AddForeignKey
ALTER TABLE "PhotoEvidence" ADD CONSTRAINT "PhotoEvidence_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAttachment" ADD CONSTRAINT "OperationAttachment_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_positive" CHECK ("count" > 0);
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_size" CHECK ("size" > 0 AND "originalSize" > 0);
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_one_parent" CHECK (("purchaseId" IS NOT NULL)::integer + ("bookingId" IS NOT NULL)::integer + ("locationId" IS NOT NULL)::integer = 1);
