import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TinyModuleKind } from './tiny.service';

export interface UpsertTinyConfigInput {
  tenantId: string;
  token: string;
  modules: TinyModuleKind[];
  enabled?: boolean;
  syncFrequency?: number; // minutes
}

@Injectable()
export class TinyConfigService {
  constructor(private readonly prisma: PrismaService) {}

  upsertConfig(input: UpsertTinyConfigInput) {
    const { tenantId, token, modules, enabled = true, syncFrequency } = input;
    return this.prisma.tinyIntegrationConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        token,
        modules,
        enabled,
        syncFrequency: syncFrequency ?? undefined,
        nextSyncAt: this.computeNextSync(syncFrequency),
      },
      update: {
        token,
        modules,
        enabled,
        syncFrequency: syncFrequency ?? undefined,
        nextSyncAt: this.computeNextSync(syncFrequency),
      },
    });
  }

  findAllEnabled() {
    return this.prisma.tinyIntegrationConfig.findMany({
      where: { enabled: true },
    });
  }

  async markSync(tenantId: string, resultDate = new Date()) {
    const config = await this.prisma.tinyIntegrationConfig.findUnique({
      where: { tenantId },
    });
    if (!config) return null;

    return this.prisma.tinyIntegrationConfig.update({
      where: { tenantId },
      data: {
        lastSyncAt: resultDate,
        nextSyncAt: this.computeNextSync(config.syncFrequency, resultDate),
      },
    });
  }

  async getStatus(tenantId: string) {
    return this.prisma.tinyIntegrationConfig.findUnique({
      where: { tenantId },
    });
  }

  private computeNextSync(
    frequencyMinutes?: number,
    reference = new Date(),
  ): Date {
    const minutes = frequencyMinutes ?? 1440;
    return new Date(reference.getTime() + minutes * 60 * 1000);
  }
}
