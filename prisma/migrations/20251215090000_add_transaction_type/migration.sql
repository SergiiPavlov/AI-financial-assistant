-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('expense', 'income');

-- AlterTable
ALTER TABLE "FinanceTransaction" ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'expense';
