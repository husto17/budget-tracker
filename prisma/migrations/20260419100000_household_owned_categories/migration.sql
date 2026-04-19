-- Add householdId to Category
ALTER TABLE "Category" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");
-- Partial unique index: enforce uniqueness per household (nulls excluded = solo users unaffected)
CREATE UNIQUE INDEX "Category_householdId_name_key" ON "Category"("householdId", "name") WHERE "householdId" IS NOT NULL;

-- Add householdId to CategoryRule
ALTER TABLE "CategoryRule" ADD COLUMN "householdId" TEXT;
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CategoryRule_householdId_idx" ON "CategoryRule"("householdId");

-- Add householdId to MerchantAlias
ALTER TABLE "MerchantAlias" ADD COLUMN "householdId" TEXT;
ALTER TABLE "MerchantAlias" ADD CONSTRAINT "MerchantAlias_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MerchantAlias_householdId_idx" ON "MerchantAlias"("householdId");
-- Partial unique index for household aliases
CREATE UNIQUE INDEX "MerchantAlias_householdId_fromName_key" ON "MerchantAlias"("householdId", "fromName") WHERE "householdId" IS NOT NULL;
