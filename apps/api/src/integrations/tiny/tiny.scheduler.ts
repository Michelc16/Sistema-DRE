import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TinyIntegrationService, TinyModuleKind } from './tiny.service';
import { TinyConfigService } from './tiny-config.service';

const ONE_MINUTE = 60 * 1000;

@Injectable()
export class TinySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TinySchedulerService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 5 * ONE_MINUTE;

  constructor(
    private readonly configService: TinyConfigService,
    private readonly integrationService: TinyIntegrationService,
  ) {}

  onModuleInit() {
    // Kick off immediately, then poll to reduce load.
    this.runCycle().catch((error) =>
      this.logger.error('Erro ao rodar ciclo inicial do Tiny Scheduler', error.stack),
    );

    this.interval = setInterval(() => {
      this.runCycle().catch((error) =>
        this.logger.error('Erro ao rodar ciclo agendado do Tiny Scheduler', error.stack),
      );
    }, this.pollIntervalMs);
  }

  async runCycle() {
    const now = new Date();
    const configs = await this.configService.findAllEnabled();
    for (const config of configs) {
      if (config.nextSyncAt && config.nextSyncAt > now) continue;

      this.logger.log(`Sincronizando Tiny para tenant ${config.tenantId}`);
      try {
        const modules = (config.modules || []) as TinyModuleKind[];
        await this.integrationService.sync({
          tenantId: config.tenantId,
          token: config.token,
          modules,
          from: config.lastSyncAt
            ? config.lastSyncAt.toISOString().slice(0, 10)
            : undefined,
        });
        await this.configService.markSync(config.tenantId);
      } catch (error: any) {
        this.logger.error(
          `Falha ao sincronizar tenant ${config.tenantId}: ${error?.message || error}`,
        );
      }
    }
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
