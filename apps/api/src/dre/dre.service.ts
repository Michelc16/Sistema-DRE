import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DREService {
    constructor(private prisma: PrismaService) {}

    async computer(tenantId: string, from: string, to: string, basis: 'caixa'|'competencia', currency = 'BRL') {
        // Simplificado: agrega por PCGAccount com base em créditos
        const rows = await this.prisma.$queryRaw<any[]>`
            WITH tx AS (
                SELECT date_trunc('month', COALESCE(t."accrualDate", t.date)) AS period,
                        t."tenantId", a."pcgAccountId" as pcg,
                        SUM(t.amount) AS total
                FROM "transaction" t
                LEFT JOIN "Account" a ON a.id = t.credit
                WHERE t."tenantId" = ${tenantId}
                    AND (COALESCE(t."accrualDate", t.date)) BETWEEN to_date(${from}||'-01','YYYY-MM-DD')
                                                              AND (to_date(${to}||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')
                GROUP BY 1,2,3
            )
            SELECT period, pcg, SUM(total) as total
            FROM tx GROUP BY 1,2 ORDER BY 1,2;';

        return { rows };
    }
}