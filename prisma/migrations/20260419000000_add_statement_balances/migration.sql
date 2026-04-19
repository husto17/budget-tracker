-- Add opening-balance anchor to Account
ALTER TABLE "Account"
  ADD COLUMN "openingBalance" DOUBLE PRECISION,
  ADD COLUMN "openingBalanceDate" TIMESTAMP(3);

-- Add statement-level balance + date-range context to Upload
ALTER TABLE "Upload"
  ADD COLUMN "openingBalance" DOUBLE PRECISION,
  ADD COLUMN "closingBalance" DOUBLE PRECISION,
  ADD COLUMN "statementStart" TIMESTAMP(3),
  ADD COLUMN "statementEnd" TIMESTAMP(3);

-- Wire up Upload → Account relation (Prisma-level only; FK already implied via accountId).
-- Index for "latest statement per account" lookups.
CREATE INDEX IF NOT EXISTS "Upload_accountId_idx" ON "Upload" ("accountId");

-- Enforce FK cascade: deleting an account deletes its uploads
ALTER TABLE "Upload"
  DROP CONSTRAINT IF EXISTS "Upload_accountId_fkey",
  ADD CONSTRAINT "Upload_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
