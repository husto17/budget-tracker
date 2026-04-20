-- Add householdId to Goal
ALTER TABLE "Goal" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Goal_householdId_idx" ON "Goal"("householdId");

-- Add householdId to Tag
ALTER TABLE "Tag" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Tag_householdId_idx" ON "Tag"("householdId");
CREATE UNIQUE INDEX "Tag_householdId_name_key" ON "Tag"("householdId", "name") WHERE "householdId" IS NOT NULL;
