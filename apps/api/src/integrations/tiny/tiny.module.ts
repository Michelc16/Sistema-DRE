import { Module } from '@nestjs/common';
import { TinyIntegrationService } from './tiny.service';
import { TinyConfigService } from './tiny-config.service';
import { TinySchedulerService } from './tiny.scheduler';
import { TinyController } from './tiny.controller';

@Module({
  controllers: [TinyController],
  providers: [TinyIntegrationService, TinyConfigService, TinySchedulerService],
  exports: [TinyIntegrationService, TinyConfigService],
})
export class TinyModule {}
