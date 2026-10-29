-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ROOM', 'AREA', 'STORAGE', 'LAUNDRY');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('DIRECT', 'AIRBNB', 'BOOKING_COM', 'AGODA', 'FACEBOOK', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('UPCOMING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "StayCondition" AS ENUM ('GOOD', 'MINOR_DAMAGE', 'DAMAGED', 'MISSING', 'STAINED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GuestChargeStatus" AS ENUM ('DRAFT', 'FOR_REVIEW', 'APPROVED', 'WAIVED', 'PAID', 'UNPAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChargePaymentStatus" AS ENUM ('NOT_DUE', 'UNPAID', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('INVENTORY_PURCHASE', 'CLEANING_SUPPLIES', 'LAUNDRY', 'MAINTENANCE', 'REPAIR', 'REPLACEMENT_ITEM', 'UTILITIES', 'POOL_MAINTENANCE', 'GARDEN_OUTDOOR', 'GUEST_AMENITIES', 'STAFF_CARETAKER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LinenStatus" ADD VALUE 'AVAILABLE';
ALTER TYPE "LinenStatus" ADD VALUE 'ASSIGNED_TO_ROOM';
ALTER TYPE "LinenStatus" ADD VALUE 'USED';
ALTER TYPE "LinenStatus" ADD VALUE 'FOR_LAUNDRY';
ALTER TYPE "LinenStatus" ADD VALUE 'IN_LAUNDRY';
ALTER TYPE "LinenStatus" ADD VALUE 'DAMAGED';
ALTER TYPE "LinenStatus" ADD VALUE 'STAINED';
ALTER TYPE "LinenStatus" ADD VALUE 'MISSING';
ALTER TYPE "LinenStatus" ADD VALUE 'FOR_REPLACEMENT';

-- AlterTable
ALTER TABLE "DamageReport" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "inspectionLineId" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "damageReportId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "payee" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "receiptNumber" TEXT,
ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'SUBMITTED',
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" "LocationType" NOT NULL DEFAULT 'AREA';

-- CreateTable
CREATE TABLE "LocationAssignment" (
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LocationAssignment_pkey" PRIMARY KEY ("locationId","userId")
);

-- CreateTable
CREATE TABLE "RoomInventory" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "assignedQuantity" INTEGER NOT NULL,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "replacementCost" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinenEnrollment" (
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinenEnrollment_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "LinenBalance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "LinenStatus" NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LinenBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinenMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStatus" "LinenStatus",
    "newStatus" "LinenStatus" NOT NULL,
    "previousLocationId" TEXT,
    "newLocationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinenMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "guestCount" INTEGER NOT NULL,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "source" "BookingSource" NOT NULL,
    "notes" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRoom" (
    "bookingId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "BookingRoom_pkey" PRIMARY KEY ("bookingId","locationId")
);

-- CreateTable
CREATE TABLE "StayInspection" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "userId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StayInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayInspectionLine" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "actualQuantity" INTEGER NOT NULL,
    "condition" "StayCondition" NOT NULL DEFAULT 'GOOD',
    "baselineQuantity" INTEGER,
    "baselineCondition" "StayCondition",
    "replacementCost" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "StayInspectionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestCharge" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "damageReportId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "replacementCost" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" "GuestChargeStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "ChargePaymentStatus" NOT NULL DEFAULT 'NOT_DUE',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationAttachment" (
    "id" TEXT NOT NULL,
    "inspectionLineId" TEXT,
    "expenseId" TEXT,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomInventory_locationId_itemId_key" ON "RoomInventory"("locationId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "LinenBalance_itemId_status_locationId_key" ON "LinenBalance"("itemId", "status", "locationId");

-- CreateIndex
CREATE INDEX "LinenMovement_createdAt_idx" ON "LinenMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE INDEX "Booking_checkInDate_checkOutDate_status_idx" ON "Booking"("checkInDate", "checkOutDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StayInspection_bookingId_locationId_type_key" ON "StayInspection"("bookingId", "locationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StayInspectionLine_inspectionId_itemId_key" ON "StayInspectionLine"("inspectionId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestCharge_reference_key" ON "GuestCharge"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "GuestCharge_damageReportId_key" ON "GuestCharge"("damageReportId");

-- CreateIndex
CREATE UNIQUE INDEX "DamageReport_inspectionLineId_key" ON "DamageReport"("inspectionLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_inspectionLineId_fkey" FOREIGN KEY ("inspectionLineId") REFERENCES "StayInspectionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_damageReportId_fkey" FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAssignment" ADD CONSTRAINT "LocationAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAssignment" ADD CONSTRAINT "LocationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInventory" ADD CONSTRAINT "RoomInventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInventory" ADD CONSTRAINT "RoomInventory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenEnrollment" ADD CONSTRAINT "LinenEnrollment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenBalance" ADD CONSTRAINT "LinenBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenBalance" ADD CONSTRAINT "LinenBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenMovement" ADD CONSTRAINT "LinenMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenMovement" ADD CONSTRAINT "LinenMovement_previousLocationId_fkey" FOREIGN KEY ("previousLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenMovement" ADD CONSTRAINT "LinenMovement_newLocationId_fkey" FOREIGN KEY ("newLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenMovement" ADD CONSTRAINT "LinenMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayInspection" ADD CONSTRAINT "StayInspection_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayInspection" ADD CONSTRAINT "StayInspection_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayInspection" ADD CONSTRAINT "StayInspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayInspectionLine" ADD CONSTRAINT "StayInspectionLine_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "StayInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayInspectionLine" ADD CONSTRAINT "StayInspectionLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCharge" ADD CONSTRAINT "GuestCharge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCharge" ADD CONSTRAINT "GuestCharge_damageReportId_fkey" FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCharge" ADD CONSTRAINT "GuestCharge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCharge" ADD CONSTRAINT "GuestCharge_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCharge" ADD CONSTRAINT "GuestCharge_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAttachment" ADD CONSTRAINT "OperationAttachment_inspectionLineId_fkey" FOREIGN KEY ("inspectionLineId") REFERENCES "StayInspectionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAttachment" ADD CONSTRAINT "OperationAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Operational invariants also apply to direct database writes.
ALTER TABLE "RoomInventory" ADD CONSTRAINT "RoomInventory_nonnegative" CHECK ("expectedQuantity" BETWEEN 0 AND 1000000 AND "assignedQuantity" BETWEEN 0 AND 1000000 AND "replacementCost" >= 0);
ALTER TABLE "LinenBalance" ADD CONSTRAINT "LinenBalance_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "LinenMovement" ADD CONSTRAINT "LinenMovement_positive" CHECK ("quantity" > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_dates_guests" CHECK ("checkOutDate" > "checkInDate" AND "guestCount" BETWEEN 1 AND 100);
ALTER TABLE "StayInspectionLine" ADD CONSTRAINT "Inspection_counts" CHECK ("expectedQuantity" >= 0 AND "actualQuantity" >= 0 AND ("baselineQuantity" IS NULL OR "baselineQuantity" >= 0) AND "replacementCost" >= 0);
ALTER TABLE "GuestCharge" ADD CONSTRAINT "GuestCharge_amounts" CHECK ("quantity" > 0 AND "replacementCost" >= 0 AND "amount" >= 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "OperationAttachment" ADD CONSTRAINT "OperationAttachment_one_parent" CHECK (("inspectionLineId" IS NOT NULL)::integer + ("expenseId" IS NOT NULL)::integer = 1);
