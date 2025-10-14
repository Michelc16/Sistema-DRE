export function mapOrderToTransaction(order: any, tenantId: string) {
    const txs: any[] = [];
    for (const item of order.items || []) {
        const revenueAcc = '3.1'; // Exemplo simplificado
        txs.push({
            tenantId,
            date: new Date(order.issueDate),
            debit: 'Clientes',
            credit: revenueAcc,
            amount: item.total,
            memo: `Pedido ${order.number} - ${item.sku}`,
            origin: 'ERP:Tiny',
            sourceRef: String(order.id),
            meta: { item }
        });
    }
    return txs;
}