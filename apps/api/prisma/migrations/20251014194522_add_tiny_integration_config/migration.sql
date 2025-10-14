-- CreateTable
CREATE TABLE "TinyIntegrationConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "modules" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncFrequency" INTEGER NOT NULL DEFAULT 1440,

    CONSTRAINT "TinyIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TinyIntegrationConfig_tenantId_key" ON "TinyIntegrationConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "TinyIntegrationConfig" ADD CONSTRAINT "TinyIntegrationConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
