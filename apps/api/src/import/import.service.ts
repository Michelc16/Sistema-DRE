import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_DEBIT_ACCOUNT = 'Clientes';
const DEFAULT_CREDIT_ACCOUNT = '3.1';

const FIELD_ALIASES: Record<string, string[]> = {
  date: [
    'date',
    'data',
    'dataPedido',
    'dataPedidoVenda',
    'dataCriacao',
    'dataEmissao',
    'dataLancamento',
    'dataDocumento',
    'dataCompetencia',
    'competencia',
    'periodo',
  ],
  accrualDate: ['accrualDate', 'dataCompetencia', 'competencia', 'competenciaData'],
  debit: ['debit', 'debito', 'contaDebito', 'contaEntrada'],
  credit: [
    'credit',
    'credito',
    'contaCredito',
    'contaSaida',
    'contaGerencial',
    'contaResultado',
    'planoConta',
    'pcg',
    'categoria',
  ],
  amount: ['amount', 'valor', 'total'],
  currency: ['currency', 'moeda'],
  origin: ['origin', 'origem', 'fonte'],
  memo: [
    'memo',
    'descricao',
    'historico',
    'observacao',
    'descricaoItem',
    'cliente',
    'fornecedor',
    'produto',
  ],
  sourceRef: ['sourceRef', 'referencia', 'documento', 'numero', 'pedido', 'nota', 'titulo', 'id'],
};

function normalizeKey(key: string) {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function normalizeRow(row: Record<string, any>) {
  const normalized: Record<string, any> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (typeof key !== 'string') return;
    normalized[normalizeKey(key)] = value;
  });
  return normalized;
}

function lookup(row: Record<string, any>, aliases: string[]) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (row[normalizedAlias] !== undefined && row[normalizedAlias] !== null) {
      return row[normalizedAlias];
    }
  }
  return undefined;
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number') {
    const base = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(base.getTime() + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const str = String(value).trim();
  if (!str) return null;

  const iso = new Date(str);
  if (!Number.isNaN(iso.getTime())) return iso;

  const brPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
  const match = str.match(brPattern);
  if (match) {
    const [, d, m, y] = match;
    const day = d.padStart(2, '0');
    const month = m.padStart(2, '0');
    const year = y.length === 2 ? `20${y}` : y.padStart(4, '0');
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseAmount(value: any): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const str = String(value).trim();
  if (!str) return null;

  const cleaned = str
    .replace(/[^\d.,\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  let normalized = cleaned;
  if (normalized.endsWith('-')) {
    normalized = `-${normalized.slice(0, -1)}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveAccount(value: any, defaultAccount: string) {
  if (!value) return defaultAccount;
  const parts = String(value)
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts[0] ?? defaultAccount;
}

function buildMemo(row: Record<string, any>) {
  const explicitMemo = lookup(row, FIELD_ALIASES.memo);
  if (explicitMemo) return String(explicitMemo);

  const customer = row[normalizeKey('cliente')] ?? row[normalizeKey('razaoSocial')];
  const doc =
    row[normalizeKey('numero')] ??
    row[normalizeKey('pedido')] ??
    row[normalizeKey('nota')] ??
    row[normalizeKey('documento')];

  const parts = [
    doc ? `Doc ${doc}` : null,
    customer ? `Cliente: ${customer}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : null;
}

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async importTransactions(tenantId: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName =
      workbook.SheetNames.find((name) => name.toLowerCase() === 'transactions') ??
      workbook.SheetNames[0];

    if (!sheetName) {
      throw new BadRequestException('Nenhuma aba encontrada no arquivo enviado.');
    }

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new BadRequestException(
        'Não foi possível ler a aba selecionada na planilha.',
      );
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
      defval: null,
      raw: false,
      dateNF: 'yyyy-mm-dd',
    });

    if (!rows.length) {
      return {
        imported: 0,
        skipped: 0,
        sheet: sheetName,
        warning: 'A planilha não contém linhas para importar.',
      };
    }

    const toPersist: Array<{
      tenantId: string;
      date: Date;
      accrualDate: Date | null;
      debit: string;
      credit: string;
      amount: Prisma.Decimal;
      currency: string;
      memo: string | null;
      origin: string;
      sourceRef: string | null;
      meta: Record<string, any>;
    }> = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    rows.forEach((originalRow, index) => {
      const normalized = normalizeRow(originalRow);

      const dateValue = lookup(normalized, FIELD_ALIASES.date);
      const date = parseDate(dateValue);
      if (!date) {
        skipped.push({ row: index + 2, reason: 'Data ausente ou inválida' });
        return;
      }

      const accrualDateValue = lookup(normalized, FIELD_ALIASES.accrualDate);
      const accrualDate = accrualDateValue ? parseDate(accrualDateValue) : null;

      const amountRaw =
        lookup(normalized, FIELD_ALIASES.amount) ??
        lookupContains(normalized, [
          'valortotal',
          'totalliquido',
          'valorliquido',
          'valorfaturado',
          'valorrecebido',
          'valorpago',
          'valorpedido',
          'valorservico',
          'valorproduto',
          'bruto',
          'pedido',
          'nota',
          'valor',
          'total',
        ]);
      const amount = parseAmount(amountRaw);
      if (amount === null) {
        const amountColumns = Object.entries(normalized)
          .filter(([key]) => key.includes('valor') || key.includes('total'))
          .slice(0, 6)
          .map(([key, value]) => `${key}:${value ?? ''}`)
          .join(', ');
        skipped.push({
          row: index + 2,
          reason: `Valor ausente ou inválido${amountColumns ? ` (colunas: ${amountColumns})` : ''}`,
        });
        return;
      }

      const debitRaw = lookup(normalized, FIELD_ALIASES.debit);
      const creditRaw = lookup(normalized, FIELD_ALIASES.credit);

      const debit = resolveAccount(debitRaw, DEFAULT_DEBIT_ACCOUNT);
      const credit = resolveAccount(creditRaw, DEFAULT_CREDIT_ACCOUNT);

      const currency =
        lookup(normalized, FIELD_ALIASES.currency) ??
        originalRow.currency ??
        originalRow.Currency ??
        'BRL';

      const origin = lookup(normalized, FIELD_ALIASES.origin) ?? 'import:xlsx';
      const sourceRefValue = lookup(normalized, FIELD_ALIASES.sourceRef);
      const sourceRef = sourceRefValue ? String(sourceRefValue) : null;

      const memo = buildMemo(normalized);

      toPersist.push({
        tenantId,
        date,
        accrualDate,
        debit,
        credit,
        amount: new Prisma.Decimal(amount),
        currency: String(currency),
        memo,
        origin: String(origin),
        sourceRef,
        meta: originalRow,
      });
    });

    if (!toPersist.length) {
      return {
        imported: 0,
        skipped: skipped.length,
        sheet: sheetName,
        warning:
          'Nenhuma linha válida encontrada. Verifique os campos obrigatórios.',
        skippedRows: skipped,
      };
    }

    await this.prisma.transaction.createMany({ data: toPersist });

    return {
      imported: toPersist.length,
      skipped: skipped.length,
      sheet: sheetName,
      skippedRows: skipped,
    };
  }
}
function lookupContains(row: Record<string, any>, patterns: string[]) {
  const keys = Object.keys(row);
  for (const pattern of patterns) {
    const key = keys.find((candidate) => candidate.includes(pattern));
    if (key && row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return undefined;
}
