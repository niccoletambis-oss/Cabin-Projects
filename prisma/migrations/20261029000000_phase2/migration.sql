-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'FOR_REPAIR', 'FOR_REPLACEMENT', 'MISSING', 'DISPOSED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DamageStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'FOR_REPAIR', 'FOR_REPLACEMENT', 'REPLACED', 'WRITTEN_OFF', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('IN_PROGRESS', 'FOR_REVIEW', 'REVIEWED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'FOR_APPROVAL', 'APPROVED', 'PURCHASED', 'RECEIVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MANAGER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportType" ADD VALUE 'BROKEN';
ALTER TYPE "ReportType" ADD VALUE 'LOST';
ALTER TYPE "ReportType" ADD VALUE 'STAINED';
ALTER TYPE "ReportType" ADD VALUE 'FOR_REPAIR';
ALTER TYPE "ReportType" ADD VALUE 'FOR_REPLACEMENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLogin" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "datePurchased" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reorderQuantity" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "requestedById" TEXT,
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "InventoryAudit" ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "reviewRemarks" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "AuditStatus" NOT NULL DEFAULT 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "AuditLine" ADD COLUMN     "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "DamageReport" ADD COLUMN     "estimatedCost" DECIMAL(12,2),
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "managementRemarks" TEXT,
ADD COLUMN     "status" "DamageStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "role" "Role";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoEvidence" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAudit" ADD CONSTRAINT "InventoryAudit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAudit" ADD CONSTRAINT "InventoryAudit_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoEvidence" ADD CONSTRAINT "PhotoEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DamageReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
