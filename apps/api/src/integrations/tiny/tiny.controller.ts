import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { TinyIntegrationService, TinyModuleKind } from './tiny.service';
import { TinyConfigService, UpsertTinyConfigInput } from './tiny-config.service';

interface TinySyncBody {
  token?: string;
  modules?: TinyModuleKind[];
  from?: string;
  pageSize?: number;
}

interface TinyConfigBody extends UpsertTinyConfigInput {
  enabled?: boolean;
  syncFrequency?: number;
}

@Controller('tenants/:tenantId/tiny')
export class TinyController {
  constructor(
    private readonly tinyService: TinyIntegrationService,
    private readonly configService: TinyConfigService,
  ) {}

  @Post('sync')
  async sync(
    @Query('tenantId') tenantId: string,
    @Body() body: TinySyncBody,
  ) {
    const existingConfig = await this.configService.getStatus(tenantId);
    const token = body.token ?? existingConfig?.token ?? '';
    if (!token) {
      throw new BadRequestException(
        'Token do Tiny não configurado. Configure antes de executar a sincronização.',
      );
    }
    const modulesFromConfig = (existingConfig?.modules ?? []).filter(
      (module): module is TinyModuleKind =>
        ['orders', 'invoices', 'financial'].includes(module),
    );

    if (body.modules && body.modules.length) {
      await this.configService.upsertConfig({
        tenantId,
        token,
        modules: body.modules,
      });
    }

    const result = await this.tinyService.sync({
      tenantId,
      token,
      modules: body.modules ?? modulesFromConfig,
      from: body.from,
      pageSize: body.pageSize,
    });
    if (existingConfig) {
      await this.configService.markSync(tenantId);
    }
    return result;
  }

  @Post('config')
  async configure(
    @Query('tenantId') tenantId: string,
    @Body() body: TinyConfigBody,
  ) {
    return this.configService.upsertConfig({
      tenantId,
      token: body.token,
      modules: body.modules ?? ['orders'],
      enabled: body.enabled,
      syncFrequency: body.syncFrequency,
    });
  }

  @Get('status')
  async status(@Query('tenantId') tenantId: string) {
    return this.configService.getStatus(tenantId);
  }
}
