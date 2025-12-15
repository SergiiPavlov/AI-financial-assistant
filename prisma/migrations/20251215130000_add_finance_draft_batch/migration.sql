-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('draft', 'applied', 'discarded');

-- CreateTable
CREATE TABLE "FinanceDraftBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lang" TEXT,
    "title" TEXT,
    "items" JSONB NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedBatchId" TEXT,
    CONSTRAINT "FinanceDraftBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceDraftBatch_userId_createdAt_idx" ON "FinanceDraftBatch"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "FinanceDraftBatch" ADD CONSTRAINT "FinanceDraftBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
