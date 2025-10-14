import { Body, Controller, Post, Query } from '@nestjs/common';
import { TinyIntegrationService, TinyModuleKind } from './tiny.service';

interface TinySyncBody {
  token: string;
  modules?: TinyModuleKind[];
  from?: string;
  pageSize?: number;
}

@Controller('tenants/:tenantId/tiny')
export class TinyController {
  constructor(private readonly tinyService: TinyIntegrationService) {}

  @Post('sync')
  async sync(
    @Query('tenantId') tenantId: string,
    @Body() body: TinySyncBody,
  ) {
    return this.tinyService.sync({
      tenantId,
      token: body.token,
      modules: body.modules,
      from: body.from,
      pageSize: body.pageSize,
    });
  }
}
