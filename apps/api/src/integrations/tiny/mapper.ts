const DEFAULT_REVENUE_ACC = '3.1';
const DEFAULT_RECEIVABLE_ACC = 'Clientes';
const DEFAULT_EXPENSE_ACC = '5.1';

function ensureDate(value: any) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function ensureNumber(value: any) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function mapOrderToTransactions(order: any, tenantId: string) {
  const items = order?.items ?? order?.itens ?? order?.pedido?.itens ?? [];
  const issueDate =
    order?.issueDate ??
    order?.issuedAt ??
    order?.data_pedido ??
    order?.pedido?.data_pedido;

  return items.map((item: any) => ({
    tenantId,
    date: ensureDate(issueDate),
    debit: DEFAULT_RECEIVABLE_ACC,
    credit: item?.accountCode ?? DEFAULT_REVENUE_ACC,
    amount: ensureNumber(item?.total ?? item?.valor_total ?? item?.item?.valor_total),
    memo: `Pedido ${order?.number ?? order?.numero ?? order?.pedido?.numero} - ${
      item?.sku ?? item?.codigo ?? item?.item?.codigo ?? ''
    }`,
    origin: 'ERP:Tiny',
    sourceRef: String(order?.id ?? order?.pedido?.id ?? order?.numero ?? ''),
    meta: { order, item },
  }));
}

export function mapInvoiceToTransactions(invoice: any, tenantId: string) {
  const total = ensureNumber(
    invoice?.total ??
      invoice?.total_value ??
      invoice?.valor_total ??
      invoice?.nota?.valor_total,
  );
  const issueDate =
    invoice?.issueDate ??
    invoice?.issuedAt ??
    invoice?.data_emissao ??
    invoice?.nota?.data_emissao;
  const memo = `Nota fiscal ${invoice?.number ?? invoice?.numero ?? invoice?.nota?.numero}`;

  return [
    {
      tenantId,
      date: ensureDate(issueDate),
      debit: DEFAULT_RECEIVABLE_ACC,
      credit: invoice?.accountCode ?? DEFAULT_REVENUE_ACC,
      amount: total,
      memo,
      origin: 'ERP:Tiny',
      sourceRef: String(invoice?.id ?? invoice?.nota?.id ?? invoice?.numero ?? ''),
      meta: { invoice },
    },
  ];
}

export function mapFinancialToTransactions(financial: any, tenantId: string) {
  const amount = ensureNumber(
    financial?.amount ??
      financial?.valor ??
      financial?.lancamento?.valor ??
      financial?.valor_titulo ??
      0,
  );

  const dueDate =
    financial?.dueDate ??
    financial?.data_vencimento ??
    financial?.lancamento?.data_vencimento ??
    financial?.data_pagamento ??
    financial?.lancamento?.data_pagamento;

  const nature = String(
    financial?.type ??
      financial?.natureza ??
      financial?.lancamento?.natureza ??
      'R',
  ).toUpperCase();

  const isRevenue = nature === 'R';

  return [
    {
      tenantId,
      date: ensureDate(dueDate),
      debit: isRevenue ? 'Caixa/Bancos' : DEFAULT_EXPENSE_ACC,
      credit: isRevenue ? DEFAULT_RECEIVABLE_ACC : 'Caixa/Bancos',
      amount,
      memo: `Financeiro ${financial?.id ?? financial?.lancamento?.id ?? ''}`,
      origin: 'ERP:Tiny',
      sourceRef: String(financial?.id ?? financial?.lancamento?.id ?? ''),
      meta: { financial },
    },
  ];
}
