import { Module } from '@nestjs/common';
import { TinyIntegrationService } from './tiny.service';
import { TinyController } from './tiny.controller';

@Module({
  controllers: [TinyController],
  providers: [TinyIntegrationService],
  exports: [TinyIntegrationService],
})
export class TinyModule {}
