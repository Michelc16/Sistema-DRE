import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.upsert({
        where: { id: 'demo-tenant' },
        update: {},
        create: { id: 'demo-tenant', name: 'Empresa Demo' }
    });

    const pcg = [
        {code: '3.1', name: 'Receita Bruta', type: 'REVENUE'},
        {code: '3.2', name: 'Dedução', type: 'DEDUCTION'},
        {code: '3.3', name: 'Receita Líquida', type: 'REVENUE'},
        {code: '4.1', name: 'CMV/CPV', type: 'REVENUE'},
        {code: '4.2', name: 'Margem Bruta', type: 'REVENUE'},
        {code: '5.1', name: 'Despesas Operacionais', type: 'OPEX'},
        {code: '9.1', name: 'Resultado do Exercício', type: 'RESULT'}
    ];

    for (const acc of pcg) {
        await prisma.pCGAccount.upsert({
            where: { id: '${tenant.id}-${acc.code}' },
            update: {},
            create: { id: `${tenant.id}-${acc.code}`, tenantId: tenant.id, ...acc }
        });
    }

    console.log('Seed ok');
}

main().finally(() => prisma.$disconnect());