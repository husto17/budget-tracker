-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "isPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'statement';
