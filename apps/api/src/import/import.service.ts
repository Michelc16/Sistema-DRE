import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

@Injectable()
export class ImportService {
    constructor(private prisma: PrismaService) {}

    async importTransactions(tenantId: string, buffer: Buffer) {
        const wb = XLSX.read(buffer);
        conts ws = wb.Sheets['Transactions'] || wb.Sheets[wb.SheetNames[0]];
        conts rows: any[] = XLSX.utils.sheet_to_json(ws);

        for (const r of rows) {
            await this.prisma.transaction.create({ date: {
                tenantId,
                date: new Date(r.Date),
                accrualDate: r.accrualDate ? new Date(r.accrualDate) : null,
                debit: String(r.debit),
                credit: String(r.credit),
                amount: new PrismaService()['$extends'] ? (r.amount as number) : r.amount,
                currency: r.currency || 'BRL',
                memo: r.memo || null,
                origin: r.origin || 'import:csv',
                sourceRef: r.sourceRef || null,
                meta: r
            }});
        }

        return { imported: rows.length };   
    }
}