-- CreateTable
CREATE TABLE "FinanceImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionIds" TEXT[] NOT NULL,
    CONSTRAINT "FinanceImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceImportBatch_userId_batchId_key" ON "FinanceImportBatch"("userId", "batchId");

-- AddForeignKey
ALTER TABLE "FinanceImportBatch" ADD CONSTRAINT "FinanceImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
