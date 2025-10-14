import { BadRequestException, Injectable } from '@nestjs/common';
import { PCGType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DreGrouping = 'month' | 'quarter' | 'year';

export interface ComputeDreOptions {
  tenantId: string;
  from: string; // YYYY-MM
  to: string;   // YYYY-MM
  basis?: 'caixa' | 'competencia';
  currency?: string;
  groupBy?: DreGrouping;
  pcg?: string[];
  types?: PCGType[];
  origins?: string[];
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface DreRow {
  period: string;
  pcgCode: string | null;
  pcgName: string | null;
  pcgType: PCGType | null;
  total: number;
  entries: number;
}

export interface DreResult {
  rows: DreRow[];
  summary: {
    total: number;
    byType: Record<string, number>;
    byPeriod: Record<string, number>;
    byPcg: Record<string, number>;
  };
  meta: {
    tenantId: string;
    from: string;
    to: string;
    basis: 'caixa' | 'competencia';
    currency: string;
    groupBy: DreGrouping;
  };
}

@Injectable()
export class DREService {
  private static readonly GROUPING_DEFAULT: DreGrouping = 'month';

  constructor(private readonly prisma: PrismaService) {}

  async compute(options: ComputeDreOptions): Promise<DreResult> {
    const {
      tenantId,
      from,
      to,
      basis = 'competencia',
      currency = 'BRL',
      groupBy = DREService.GROUPING_DEFAULT,
      pcg,
      types,
      origins,
      minAmount,
      maxAmount,
      search,
    } = options;

    this.ensurePeriod(from);
    this.ensurePeriod(to);

    const dateExpr =
      basis === 'caixa'
        ? 't."date"'
        : 'COALESCE(t."accrualDate", t."date")';

    const periodExpr = this.groupingToSql(groupBy, dateExpr);

    const whereClauses: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`${Prisma.raw(dateExpr)} BETWEEN to_date(${from} || '-01','YYYY-MM-DD')
        AND (to_date(${to} || '-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')`,
    ];

    if (pcg?.length) {
      const pcgValues = Prisma.join(pcg);
      whereClauses.push(Prisma.sql`t."credit" IN (${pcgValues})`);
    }

    if (types?.length) {
      const typeValues = Prisma.join(types);
      whereClauses.push(Prisma.sql`pcg."type" IN (${typeValues})`);
    }

    if (origins?.length) {
      const originValues = Prisma.join(origins);
      whereClauses.push(Prisma.sql`t."origin" IN (${originValues})`);
    }

    if (typeof minAmount === 'number' && !Number.isNaN(minAmount)) {
      whereClauses.push(Prisma.sql`t."amount" >= ${minAmount}`);
    }

    if (typeof maxAmount === 'number' && !Number.isNaN(maxAmount)) {
      whereClauses.push(Prisma.sql`t."amount" <= ${maxAmount}`);
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push(
        Prisma.sql`(
          pcg."name" ILIKE ${term}
          OR t."credit" ILIKE ${term}
          OR t."debit" ILIKE ${term}
          OR t."memo" ILIKE ${term}
          OR COALESCE(t."sourceRef", '') ILIKE ${term}
        )`
      );
    }

    const whereSql = Prisma.join(whereClauses, ' AND ');

    const rows = await this.prisma.$queryRaw<
      Array<{
        period: Date;
        pcg_code: string | null;
        pcg_name: string | null;
        pcg_type: PCGType | null;
        total: Prisma.Decimal;
        entries: bigint;
      }>
    >`
      SELECT
        ${Prisma.raw(periodExpr)} AS period,
        t."credit" AS pcg_code,
        COALESCE(pcg."name", t."credit") AS pcg_name,
        pcg."type" AS pcg_type,
        SUM(t."amount") AS total,
        COUNT(*)::bigint AS entries
      FROM "Transaction" t
      LEFT JOIN "PCGAccount" pcg
        ON pcg."code" = t."credit"
       AND pcg."tenantId" = t."tenantId"
      WHERE ${whereSql}
      GROUP BY period, pcg_code, pcg_name, pcg_type
      ORDER BY period ASC, pcg_code ASC
    `;

    const parsedRows: DreRow[] = rows.map((row) => ({
      period: row.period.toISOString(),
      pcgCode: row.pcg_code,
      pcgName: row.pcg_name,
      pcgType: row.pcg_type,
      total: Number(row.total),
      entries: Number(row.entries),
    }));

    const summary = this.buildSummary(parsedRows);

    return {
      rows: parsedRows,
      summary,
      meta: {
        tenantId,
        from,
        to,
        basis,
        currency,
        groupBy,
      },
    };
  }

  async getFilters(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId é obrigatório');
    }

    const [pcgAccounts, origins, currencies] = await Promise.all([
      this.prisma.pCGAccount.findMany({
        where: { tenantId },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, type: true },
      }),
      this.prisma.transaction.findMany({
        where: { tenantId },
        distinct: ['origin'],
        select: { origin: true },
        orderBy: { origin: 'asc' },
      }),
      this.prisma.transaction.findMany({
        where: { tenantId },
        distinct: ['currency'],
        select: { currency: true },
        orderBy: { currency: 'asc' },
      }),
    ]);

    return {
      pcgAccounts: pcgAccounts.map((pcg) => ({
        id: pcg.id,
        code: pcg.code,
        name: pcg.name,
        type: pcg.type,
      })),
      pcgTypes: Object.values(PCGType),
      origins: origins
        .map((item) => item.origin)
        .filter((origin): origin is string => Boolean(origin)),
      currencies: currencies
        .map((item) => item.currency)
        .filter((currency): currency is string => Boolean(currency)),
      bases: ['caixa', 'competencia'] as const,
      groupings: ['month', 'quarter', 'year'] as const,
    };
  }

  private buildSummary(rows: DreRow[]) {
    const total = rows.reduce((acc, row) => acc + row.total, 0);

    const byType = rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.pcgType ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + row.total;
      return acc;
    }, {});

    const byPeriod = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.period] = (acc[row.period] ?? 0) + row.total;
      return acc;
    }, {});

    const byPcg = rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.pcgCode ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + row.total;
      return acc;
    }, {});

    return { total, byType, byPeriod, byPcg };
  }

  private groupingToSql(groupBy: DreGrouping, dateExpr: string) {
    switch (groupBy) {
      case 'quarter':
        return `date_trunc('quarter', ${dateExpr})`;
      case 'year':
        return `date_trunc('year', ${dateExpr})`;
      case 'month':
      default:
        return `date_trunc('month', ${dateExpr})`;
    }
  }

  private ensurePeriod(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        `Período inválido: "${value}". Utilize o formato YYYY-MM.`,
      );
    }
  }
}
