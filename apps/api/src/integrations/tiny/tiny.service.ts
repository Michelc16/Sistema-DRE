import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TinyClient, TinyListParams } from './tiny-client';
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
      const listParams: TinyListParams = {
        updateFrom: options.from,
        issuedFrom: options.from,
        dueFrom: options.from,
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
    params: TinyListParams,
  ) {
    const accumulator: any[] = [];
    for (let page = 1; page <= TinyIntegrationService.MAX_PAGES; page++) {
      const payload = await this.fetchModule(client, module, { ...params, page });
      const items = this.extractModuleData(module, payload);
      if (!items.length) break;
      accumulator.push(...items);

      if (items.length < (params.pageSize ?? TinyIntegrationService.DEFAULT_PAGE_SIZE)) {
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
          mapOrderToTransactions(order, tenantId),
        );
        break;
      case 'invoices':
        transactions = payload.flatMap((invoice) =>
          mapInvoiceToTransactions(invoice, tenantId),
        );
        break;
      case 'financial':
        transactions = payload.flatMap((entry) =>
          mapFinancialToTransactions(entry, tenantId),
        );
        break;
    }

    if (!transactions.length) return 0;

    await this.prisma.transaction.createMany({
      data: transactions.map((tx) => ({
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
    });

    return transactions.length;
  }

  private async fetchModule(
    client: TinyClient,
    module: TinyModuleKind,
    params: TinyListParams,
  ) {
    switch (module) {
      case 'orders':
        return client.listOrders(params);
      case 'invoices':
        return client.listInvoices(params);
      case 'financial':
        return client.listFinancial(params);
      default:
        throw new Error(`Unsupported Tiny module "${module}"`);
    }
  }

  private extractModuleData(module: TinyModuleKind, payload: any) {
    const root = payload?.retorno ?? payload ?? {};
    switch (module) {
      case 'orders':
        return this.unwrapCollection(root, 'pedidos', 'pedido') ??
          this.unwrapCollection(root, 'orders', 'order');
      case 'invoices':
        return this.unwrapCollection(root, 'notas_fiscais', 'nota_fiscal') ??
          this.unwrapCollection(root, 'invoices', 'invoice');
      case 'financial':
        return this.unwrapCollection(root, 'lancamentos', 'lancamento') ??
          this.unwrapCollection(root, 'financial', 'entry');
      default:
        return [];
    }
  }

  private unwrapCollection(root: any, pluralKey: string, singularKey: string) {
    const collection = root?.[pluralKey];
    if (!collection) return [];
    if (Array.isArray(collection)) {
      return collection.map((entry) => entry?.[singularKey] ?? entry);
    }
    if (Array.isArray(collection?.[pluralKey])) {
      return collection[pluralKey].map((entry: any) => entry?.[singularKey] ?? entry);
    }
    return [];
  }
}
