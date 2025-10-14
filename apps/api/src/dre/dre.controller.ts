import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DREService, DreGrouping } from './dre.service';
import { PCGType } from '@prisma/client';

@Controller('dre')
export class DREController {
  constructor(private svc: DREService) {}

  @Get()
  async getDre(@Query() query: Record<string, string | string[]>) {

    const tenantId = this.normalizeSingle(query.tenantId);
    const from = this.normalizeSingle(query.from);
    const to = this.normalizeSingle(query.to);

    if (!tenantId || !from || !to) {
      throw new BadRequestException(
        'Parâmetros obrigatórios: tenantId, from (YYYY-MM) e to (YYYY-MM)',
      );
    }

    const basis =
      (this.normalizeSingle(query.basis) as 'caixa' | 'competencia') ??
      'competencia';
    const currency = this.normalizeSingle(query.currency) ?? 'BRL';
    const groupBy = (this.normalizeSingle(query.groupBy) as DreGrouping) ?? 'month';
    const pcg = this.normalizeList(query.pcg);
    const types = this.normalizeList(query.types) as PCGType[] | undefined;
    const origins = this.normalizeList(query.origins);
    const minAmount = this.parseNumber(this.normalizeSingle(query.minAmount));
    const maxAmount = this.parseNumber(this.normalizeSingle(query.maxAmount));
    const search = this.normalizeSingle(query.search) ?? undefined;

    return this.svc.compute({
      tenantId,
      from,
      to,
      basis,
      currency,
      groupBy,
      pcg,
      types,
      origins,
      minAmount,
      maxAmount,
      search,
    });
  }

  @Get('filters')
  async getFilters(@Query('tenantId') tenantId: string) {
    return this.svc.getFilters(tenantId);
  }

  private normalizeSingle(value: string | string[] | undefined) {
    if (Array.isArray(value)) return value[0];
    return value ?? undefined;
  }

  private normalizeList(value: string | string[] | undefined) {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseNumber(value: string | undefined) {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
