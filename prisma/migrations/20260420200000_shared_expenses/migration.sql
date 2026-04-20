-- Make reimbursementTxId optional (shared expenses don't require a matching bank credit)
ALTER TABLE "Reimbursement" ALTER COLUMN "reimbursementTxId" DROP NOT NULL;

-- Add settled tracking
ALTER TABLE "Reimbursement" ADD COLUMN "settled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Reimbursement" ADD COLUMN "settledAt" TIMESTAMP(3);

-- Add household scoping
ALTER TABLE "Reimbursement" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Reimbursement_householdId_idx" ON "Reimbursement"("householdId");
