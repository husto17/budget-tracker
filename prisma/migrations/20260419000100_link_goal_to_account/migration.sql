ALTER TABLE "Goal" ADD COLUMN "linkedAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "Goal_linkedAccountId_idx" ON "Goal" ("linkedAccountId");
