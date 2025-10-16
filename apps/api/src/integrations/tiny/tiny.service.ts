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
  /** Registros atualizados a partir desta data (YYYY-MM-DD) */
  updateFrom?: string;
  /** Registros atualizados até esta data (YYYY-MM-DD) */
  updateTo?: string;
  /** Registros emitidos a partir desta data (YYYY-MM-DD) */
  issuedFrom?: string;
  /** Registros emitidos até esta data (YYYY-MM-DD) */
  issuedTo?: string;
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
  // O Tiny retorna até 100 registros por página por padrão【269680029802184†L341-L343】.
  // Ajuste o tamanho padrão para 100 e remova o limite artificial de páginas.
  private static readonly DEFAULT_PAGE_SIZE = 100;

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
        updateFrom: options.updateFrom,
        updateTo: options.updateTo,
        issuedFrom: options.issuedFrom,
        issuedTo: options.issuedTo,
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
    params: {
      updateFrom?: string;
      updateTo?: string;
      issuedFrom?: string;
      issuedTo?: string;
      dueFrom?: string;
      dueTo?: string;
      pageSize?: number;
      page?: number;
    },
  ) {
    const accumulator: any[] = [];
    let page = 1;
    const pageSize = params.pageSize ?? TinyIntegrationService.DEFAULT_PAGE_SIZE;

    // Percorre todas as páginas até que a última retorne menos registros que o pageSize.
    while (true) {
      const summaries = await this.fetchModule(client, module, {
        ...params,
        page,
      });
      if (!summaries.length) break;
      // Busca os detalhes de cada item resumido.
      for (const summary of summaries) {
        const detail = await this.fetchDetail(client, module, summary);
        if (detail) accumulator.push(detail);
      }
      // Se a quantidade de registros retornados for menor que o tamanho da página,
      // significa que chegamos à última página.
      if (summaries.length < pageSize) break;
      page++;
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
    params: {
      updateFrom?: string;
      updateTo?: string;
      issuedFrom?: string;
      issuedTo?: string;
      pageSize?: number;
      page?: number;
    },
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