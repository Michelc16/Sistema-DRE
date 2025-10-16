/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,externalId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,externalId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,origin,sourceRef]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "externalId" TEXT NOT NULL,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'ERP:Tiny:invoice',
ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "externalId" TEXT NOT NULL,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'ERP:Tiny:order',
ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_externalId_key" ON "Invoice"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_externalId_key" ON "Order"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_date_idx" ON "Transaction"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_tenantId_origin_sourceRef_key" ON "Transaction"("tenantId", "origin", "sourceRef");
