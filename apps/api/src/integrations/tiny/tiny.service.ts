import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TinyClient } from './tiny-client';
import {
  mapFinancialToTransactions,
  mapInvoiceToTransactions,
  mapOrderToTransactions,
} from './mapper';

export type TinyModuleKind = 'orders' | 'invoices' | 'financial';

export interface TinySyncOptions {
  tenantId: string;
  token: string;
  modules?: TinyModuleKind[];
  from?: string;
  pageSize?: number;
}

export interface TinySyncResult {
  module: TinyModuleKind;
  pulled: number;
  persisted: number;
}

@Injectable()
export class TinyIntegrationService {
  private readonly logger = new Logger(TinyIntegrationService.name);
  private static readonly DEFAULT_PAGE_SIZE = 50;
  private static readonly MAX_PAGES = 20;

  constructor(private readonly prisma: PrismaService) {}

  async sync(options: TinySyncOptions) {
    const modules =
      options.modules && options.modules.length > 0
        ? options.modules
        : (['orders'] as TinyModuleKind[]);

    const results: TinySyncResult[] = [];
    const client = new TinyClient(options.token);

    for (const module of modules) {
      const listParams = {
        updateFrom: options.from,
        issuedFrom: options.from,
        pageSize: options.pageSize ?? TinyIntegrationService.DEFAULT_PAGE_SIZE,
      };
      const pulled = await this.collect(module, client, listParams);
      const persisted = await this.persist(module, pulled, options.tenantId);
      results.push({ module, pulled: pulled.length, persisted });
    }

    return {
      tenantId: options.tenantId,
      syncedAt: new Date().toISOString(),
      results,
    };
  }

  private async collect(
    module: TinyModuleKind,
    client: TinyClient,
    params: { updateFrom?: string; issuedFrom?: string; pageSize?: number },
  ) {
    const accumulator: any[] = [];
    for (let page = 1; page <= TinyIntegrationService.MAX_PAGES; page++) {
      const summaries = await this.fetchModule(client, module, { ...params, page });
      if (!summaries.length) break;

      for (const summary of summaries) {
        const detail = await this.fetchDetail(client, module, summary);
        if (detail) accumulator.push(detail);
      }

      if (
        summaries.length <
        (params.pageSize ?? TinyIntegrationService.DEFAULT_PAGE_SIZE)
      ) {
        break;
      }
    }

    return accumulator;
  }

  private async persist(module: TinyModuleKind, payload: any[], tenantId: string) {
    if (!payload.length) return 0;

    let transactions: any[] = [];
    switch (module) {
      case 'orders':
        transactions = payload.flatMap((order) =>
          mapOrderToTransactions(order, tenantId, 'ERP:Tiny:orders'),
        );
        break;
      case 'invoices':
        transactions = payload.flatMap((invoice) =>
          mapInvoiceToTransactions(invoice, tenantId, 'ERP:Tiny:invoices'),
        );
        break;
      case 'financial':
        transactions = payload.flatMap((entry) =>
          mapFinancialToTransactions(entry, tenantId, 'ERP:Tiny:financial'),
        );
        break;
    }

    if (!transactions.length) return 0;

    const uniqueRefs = new Set<string>(
      transactions
        .map((tx) => tx.sourceRef)
        .filter((ref): ref is string => Boolean(ref)),
    );

    let existingRefs = new Set<string>();
    if (uniqueRefs.size) {
      const origins = Array.from(
        new Set(
          transactions
            .map((tx) => tx.origin ?? 'ERP:Tiny')
            .filter((origin): origin is string => Boolean(origin)),
        ),
      );
      const existing = await this.prisma.transaction.findMany({
        where: {
          tenantId,
          origin: { in: origins },
          sourceRef: { in: Array.from(uniqueRefs) },
        },
        select: { sourceRef: true },
      });
      existingRefs = new Set(
        existing
          .map((item) => item.sourceRef)
          .filter((ref): ref is string => Boolean(ref)),
      );
    }

    const { fresh, updates } = transactions.reduce(
      (acc: { fresh: any[]; updates: any[] }, tx: any) => {
        if (!tx.sourceRef || !existingRefs.has(tx.sourceRef)) {
          acc.fresh.push(tx);
        } else {
          acc.updates.push(tx);
        }
        return acc;
      },
      { fresh: [] as any[], updates: [] as any[] },
    );

    if (updates.length) {
      await Promise.all(
        updates.map((tx: any) =>
          this.prisma.transaction.updateMany({
            where: {
              tenantId,
              origin: tx.origin ?? 'ERP:Tiny',
              sourceRef: tx.sourceRef!,
            },
            data: {
              date: tx.date instanceof Date ? tx.date : new Date(tx.date),
              accrualDate:
                tx.accrualDate instanceof Date
                  ? tx.accrualDate
                  : tx.accrualDate
                  ? new Date(tx.accrualDate)
                  : null,
              debit: tx.debit,
              credit: tx.credit,
              amount: new Prisma.Decimal(tx.amount ?? 0),
              currency: tx.currency ?? 'BRL',
              memo: tx.memo ?? null,
              origin: tx.origin ?? 'ERP:Tiny',
              meta: tx.meta ?? {},
            },
          }),
        ),
      );
    }

    if (!fresh.length) return 0;

    await this.prisma.transaction.createMany({
      data: fresh.map((tx) => ({
        tenantId: tx.tenantId,
        date: tx.date instanceof Date ? tx.date : new Date(tx.date),
        accrualDate:
          tx.accrualDate instanceof Date
            ? tx.accrualDate
            : tx.accrualDate
            ? new Date(tx.accrualDate)
            : null,
        debit: tx.debit,
        credit: tx.credit,
        amount: new Prisma.Decimal(tx.amount ?? 0),
        currency: tx.currency ?? 'BRL',
        memo: tx.memo ?? null,
        origin: tx.origin ?? 'ERP:Tiny',
        sourceRef: tx.sourceRef ?? null,
        meta: tx.meta ?? {},
      })),
      skipDuplicates: true,
    });

    return fresh.length;
  }

  private async fetchModule(
    client: TinyClient,
    module: TinyModuleKind,
    params: { updateFrom?: string; issuedFrom?: string; pageSize?: number; page?: number },
  ) {
    switch (module) {
      case 'orders':
        return client.searchOrders(params);
      case 'invoices':
        return client.searchInvoices(params);
      case 'financial':
        return [
          ...(await client.searchReceivables(params)),
          ...(await client.searchPayables(params)),
        ];
      default:
        throw new Error(`Unsupported Tiny module "${module}"`);
    }
  }

  private async fetchDetail(client: TinyClient, module: TinyModuleKind, summary: any) {
    try {
      switch (module) {
        case 'orders':
          return client.getOrderDetail(summary);
        case 'invoices':
          return client.getInvoiceDetail(summary);
        case 'financial':
          return summary.__tinyType === 'pagar'
            ? client.getPayableDetail(summary)
            : client.getReceivableDetail(summary);
        default:
          return summary;
      }
    } catch (error) {
      this.logger.warn(
        `Não foi possível obter detalhes do módulo ${module}: ${error instanceof Error ? error.message : error}`,
      );
      return summary;
    }
  }

}
