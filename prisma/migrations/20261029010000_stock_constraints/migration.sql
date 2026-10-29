-- Defense in depth: preserve history while rejecting impossible stock at the database boundary.
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_stock_bounds" CHECK ("quantity" BETWEEN 0 AND 1000000 AND "minimumStock" BETWEEN 0 AND 1000000 AND "reorderQuantity" BETWEEN 0 AND 1000000 AND "unitCost" >= 0);
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_positive_quantity" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_valid_amounts" CHECK ("quantity" BETWEEN 1 AND 1000000 AND "unitCost" >= 0);
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_valid_quantity" CHECK ("quantity" BETWEEN 1 AND 1000000 AND ("estimatedCost" IS NULL OR "estimatedCost" >= 0));
ALTER TABLE "AuditLine" ADD CONSTRAINT "AuditLine_nonnegative_counts" CHECK ("expectedQuantity" >= 0 AND "countedQuantity" >= 0);
-- Preserve the meaning of any existing Phase 1 purchases/audits.
UPDATE "Purchase" SET "status" = 'RECEIVED' WHERE "receivedAt" IS NOT NULL;
UPDATE "InventoryAudit" SET "status" = 'FOR_REVIEW' WHERE "completedAt" IS NOT NULL AND "status" = 'IN_PROGRESS';
