import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async importTransactions(tenantId: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName =
      workbook.SheetNames.find((name) => name.toLowerCase() === 'transactions') ??
      workbook.SheetNames[0];

    if (!sheetName) {
      throw new BadRequestException(
        'Nenhuma aba encontrada no arquivo enviado.',
      );
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

    rows.forEach((row, index) => {
      const dateValue =
        row.date ??
        row.Date ??
        row.data ??
        row.Data ??
        row['Data Lançamento'];
      const debit = row.debit ?? row.Debit ?? row.debito;
      const credit = row.credit ?? row.Credit ?? row.credito;
      const amountValue = row.amount ?? row.Amount ?? row.valor ?? row.Total;

      if (!dateValue || !credit || !debit) {
        skipped.push({
          row: index + 2, // considerando cabeçalho
          reason: 'Campos obrigatórios ausentes (date/debit/credit)',
        });
        return;
      }

      const parsedDate = new Date(dateValue);
      if (Number.isNaN(parsedDate.getTime())) {
        skipped.push({
          row: index + 2,
          reason: `Data inválida (${dateValue})`,
        });
        return;
      }

      const accrualDateValue =
        row.accrualDate ?? row.accrual_date ?? row['Data Competência'];
      const accrualDate =
        accrualDateValue && !Number.isNaN(new Date(accrualDateValue).getTime())
          ? new Date(accrualDateValue)
          : null;

      const amount = Number(amountValue ?? 0);
      if (!Number.isFinite(amount)) {
        skipped.push({
          row: index + 2,
          reason: `Valor inválido (${amountValue})`,
        });
        return;
      }

      toPersist.push({
        tenantId,
        date: parsedDate,
        accrualDate,
        debit: String(debit),
        credit: String(credit),
        amount: new Prisma.Decimal(amount),
        currency: String(row.currency ?? row.Currency ?? 'BRL'),
        memo: row.memo ?? row.Memo ?? null,
        origin: row.origin ?? row.Origin ?? 'import:xlsx',
        sourceRef: row.sourceRef ?? row.SourceRef ?? row['Ref'] ?? null,
        meta: row,
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
