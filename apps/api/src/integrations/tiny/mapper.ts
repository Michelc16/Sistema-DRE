const DEFAULT_REVENUE_ACC = '3.1';
const DEFAULT_RECEIVABLE_ACC = 'Clientes';
const DEFAULT_EXPENSE_ACC = '5.1';

function ensureDate(value: any) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function ensureNumber(value: any) {
  const num = Number(
    typeof value === 'string'
      ? value.replace(/\./g, '').replace(',', '.')
      : value ?? 0,
  );
  return Number.isFinite(num) ? num : 0;
}

function resolveAccountCode(source: any, fallback = DEFAULT_REVENUE_ACC) {
  return (
    source?.accountCode ??
    source?.conta_gerencial?.codigo ??
    source?.contaGerencial ??
    source?.categoria?.codigo ??
    source?.plano_contas?.codigo ??
    source?.classificacao ??
    fallback
  );
}

function extractItems(collection: any) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.item)) return collection.item;
  if (collection.item) return [collection.item];
  if (Array.isArray(collection.itens)) return collection.itens;
  return [];
}

function normalizeOrder(order: any) {
  const base = order?.pedido ?? order;
  const items = extractItems(base?.itens ?? base?.items ?? base?.produto);
  return {
    id:
      base?.id ??
      base?.codigo ??
      order?.id ??
      order?.numero ??
      base?.numero,
    number: base?.numero ?? order?.numero ?? base?.id,
    issueDate:
      base?.data_pedido ??
      base?.data_criacao ??
      base?.data ??
      order?.issueDate,
    total:
      ensureNumber(base?.valor_total ?? base?.total_pedido ?? order?.total),
    customer: base?.cliente?.nome ?? base?.cliente_nome ?? order?.clienteNome,
    items,
  };
}

function normalizeInvoice(invoice: any) {
  const base = invoice?.nota ?? invoice?.nota_fiscal ?? invoice;
  return {
    id: base?.id ?? invoice?.id ?? base?.numero,
    number: base?.numero ?? invoice?.numero,
    issueDate:
      base?.data_emissao ??
      invoice?.data_emissao ??
      invoice?.issueDate ??
      base?.data,
    total: ensureNumber(base?.valor_total ?? invoice?.valor_total),
    items: extractItems(base?.itens ?? base?.items),
  };
}

function normalizeFinancial(financial: any) {
  const base = financial?.lancamento ?? financial?.titulo ?? financial;
  const tinyTypeRaw = financial?.__tinyType ?? base?.tipo ?? base?.natureza ?? 'receber';
  const tinyType = String(tinyTypeRaw).toLowerCase();
  const normalizedNature = tinyType.startsWith('p') ? 'P' : 'R';
  return {
    id: base?.id ?? financial?.id ?? base?.numero,
    description: base?.descricao ?? base?.historico ?? financial?.descricao,
    amount: ensureNumber(base?.valor ?? base?.valor_titulo ?? financial?.valor),
    nature: normalizedNature,
    dueDate:
      base?.data_vencimento ??
      base?.data_pagamento ??
      financial?.data_vencimento ??
      financial?.data_pagamento,
    category: base?.categoria ?? base?.conta_contabil,
    tinyType,
  };
}

export function mapOrderToTransactions(
  orderInput: any,
  tenantId: string,
  origin = 'ERP:Tiny:order',
) {
  const order = normalizeOrder(orderInput);
  const orderId = String(order.id ?? order.number ?? Date.now());
  const issueDate = ensureDate(order.issueDate);

  const items = order.items;
  if (!items.length) {
    return [
      {
        tenantId,
        date: issueDate,
        accrualDate: issueDate,
        debit: DEFAULT_RECEIVABLE_ACC,
        credit: DEFAULT_REVENUE_ACC,
        amount: order.total,
        currency: 'BRL',
        memo: `Pedido ${order.number}`,
        origin,
        sourceRef: `tiny:order:${orderId}`,
        meta: orderInput,
      },
    ];
  }

  return items.map((item: any, index: number) => {
    const normalizedItem = item?.item ?? item;
    const account = resolveAccountCode(normalizedItem);
    const amount = ensureNumber(
      normalizedItem?.valor_total ??
        normalizedItem?.valor ??
        normalizedItem?.total,
    );
    const memoParts = [
      `Pedido ${order.number}`,
      normalizedItem?.descricao ?? normalizedItem?.nome ?? normalizedItem?.descricao_produto,
    ].filter(Boolean);

    return {
      tenantId,
      date: issueDate,
      accrualDate: issueDate,
      debit: DEFAULT_RECEIVABLE_ACC,
      credit: account,
      amount,
      currency: 'BRL',
      memo: memoParts.join(' · '),
      origin,
      sourceRef: `tiny:order:${orderId}:item:${normalizedItem?.id ?? index}`,
      meta: { order: orderInput, item: normalizedItem },
    };
  });
}

export function mapInvoiceToTransactions(
  invoiceInput: any,
  tenantId: string,
  origin = 'ERP:Tiny:invoice',
) {
  const invoice = normalizeInvoice(invoiceInput);
  const invoiceId = String(invoice.id ?? invoice.number ?? Date.now());
  const issueDate = ensureDate(invoice.issueDate);
  const items = invoice.items;

  if (!items.length) {
    return [
      {
        tenantId,
        date: issueDate,
        accrualDate: issueDate,
        debit: DEFAULT_RECEIVABLE_ACC,
        credit: DEFAULT_REVENUE_ACC,
        amount: invoice.total,
        currency: 'BRL',
        memo: `Nota fiscal ${invoice.number}`,
        origin,
        sourceRef: `tiny:invoice:${invoiceId}`,
        meta: invoiceInput,
      },
    ];
  }

  return items.map((item: any, index: number) => {
    const normalizedItem = item?.item ?? item;
    const account = resolveAccountCode(normalizedItem);
    const amount = ensureNumber(
      normalizedItem?.valor_total ??
        normalizedItem?.valor ??
        normalizedItem?.total,
    );
    const memoParts = [
      `Nota ${invoice.number}`,
      normalizedItem?.descricao ?? normalizedItem?.nome,
    ].filter(Boolean);

    return {
      tenantId,
      date: issueDate,
      accrualDate: issueDate,
      debit: DEFAULT_RECEIVABLE_ACC,
      credit: account,
      amount,
      currency: 'BRL',
      memo: memoParts.join(' · '),
      origin,
      sourceRef: `tiny:invoice:${invoiceId}:item:${normalizedItem?.id ?? index}`,
      meta: { invoice: invoiceInput, item: normalizedItem },
    };
  });
}

export function mapFinancialToTransactions(
  financialInput: any,
  tenantId: string,
  origin = 'ERP:Tiny:financial',
) {
  const financial = normalizeFinancial(financialInput);
  const id = String(financial.id ?? Date.now());
  const date = ensureDate(financial.dueDate);
  const isPayable = (financial.tinyType ?? '').toLowerCase() === 'pagar';
  const amount = Math.abs(ensureNumber(financial.amount));

  const memoParts = [
    financial.description ?? 'Lançamento financeiro',
    financial.category,
  ].filter(Boolean);

  return [
    {
      tenantId,
      date,
      accrualDate: date,
      debit: isPayable ? DEFAULT_EXPENSE_ACC : DEFAULT_RECEIVABLE_ACC,
      credit: isPayable ? 'Caixa/Bancos' : DEFAULT_REVENUE_ACC,
      amount,
      currency: 'BRL',
      memo: memoParts.join(' · '),
      origin,
      sourceRef: `tiny:financial:${id}`,
      meta: financialInput,
    },
  ];
}
