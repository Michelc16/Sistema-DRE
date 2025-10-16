import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
    @Param('tenantId') tenantId: string,
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

    const dateFilter = body.from;
    const result = await this.tinyService.sync({
      tenantId,
      token,
      modules:
        body.modules && body.modules.length
          ? body.modules
          : modulesFromConfig.length
          ? modulesFromConfig
          : undefined,
      updateFrom: dateFilter,
      issuedFrom: dateFilter,
      pageSize: body.pageSize,
    });
    if (existingConfig) {
      await this.configService.markSync(tenantId);
    }
    return result;
  }

  @Post('config')
  async configure(
    @Param('tenantId') tenantId: string,
    @Body() body: TinyConfigBody,
  ) {
    const modules: TinyModuleKind[] =
      body.modules && body.modules.length
        ? body.modules
        : (['orders'] as TinyModuleKind[]);

    return this.configService.upsertConfig({
      tenantId,
      token: body.token,
      modules,
      enabled: body.enabled,
      syncFrequency: body.syncFrequency,
    });
  }

  @Get('status')
  async status(@Param('tenantId') tenantId: string) {
    return this.configService.getStatus(tenantId);
  }
}
