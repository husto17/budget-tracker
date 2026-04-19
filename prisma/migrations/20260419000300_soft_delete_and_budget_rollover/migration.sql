ALTER TABLE "Transaction" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Category" ADD COLUMN "budgetRollover" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");
