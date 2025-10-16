const DEFAULT_REVENUE_ACC = '3.1';
const DEFAULT_RECEIVABLE_ACC = 'Clientes';
const DEFAULT_EXPENSE_ACC = '5.1';

type ParcelInfo = { value: number; dueDate?: string | null };

function ensureDate(value: any) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function ensureNumber(value: any) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const str = String(value).trim();
  if (!str) return 0;

  const cleaned = str
    .replace(/[^\d.,\-]/g, '')
    .replace(/\.(?=\d{3}([^\d]|$))/g, '')
    .replace(',', '.');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
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

/**
 * Tenta inferir o canal de venda (marketplace) a partir das
 * informações disponíveis no pedido. Usa o número do pedido no e-commerce
 * (numero_ecommerce) e o nome do vendedor para detectar padrões.
 * Caso nenhum padrão seja identificado, retorna 'Outros'.
 */
function resolvePlatform(order: any): string {
  if (!order) return 'Outros';
  const base = order?.pedido ?? order;
  const ecommerceId = String(base?.numero_ecommerce ?? base?.numeroEcommerce ?? '').toLowerCase();
  const sellerName = String(base?.nome_vendedor ?? base?.nomeVendedor ?? '').toLowerCase();

  if (/mercado|^ml/.test(ecommerceId) || sellerName.includes('mercado livre')) {
    return 'Mercado Livre';
  }
  if (/amz|amazon/.test(ecommerceId) || sellerName.includes('amazon')) {
    return 'Amazon';
  }
  if (/magalu|magazine|via|b2w/.test(ecommerceId) || sellerName.includes('magalu')) {
    return 'Magalu/Via';
  }
  if (/shopee/.test(ecommerceId) || sellerName.includes('shopee')) {
    return 'Shopee';
  }
  return 'Outros';
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
    total: ensureNumber(
      base?.valor_total ??
        base?.total_pedido ??
        base?.valor_produtos ??
        base?.valor_itens ??
        base?.total ??
        order?.valor ??
        order?.total,
    ),
    customer: base?.cliente?.nome ?? base?.cliente_nome ?? order?.clienteNome,
    parcels: extractItems(base?.parcelas).map((entry: any): ParcelInfo => {
      const parcela = entry?.parcela ?? entry;
      return {
        value: ensureNumber(parcela?.valor ?? parcela?.valor_parcela),
        dueDate: parcela?.data ?? parcela?.data_vencimento,
      };
    }),
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
    total: ensureNumber(
      base?.valor_total ??
        base?.valor_produtos ??
        invoice?.valor_total ??
        invoice?.total,
    ),
    items: extractItems(base?.itens ?? base?.items),
    parcels: extractItems(base?.parcelas).map((entry: any): ParcelInfo => {
      const parcela = entry?.parcela ?? entry;
      return {
        value: ensureNumber(parcela?.valor ?? parcela?.valor_parcela),
        dueDate: parcela?.data ?? parcela?.data_vencimento,
      };
    }),
  };
}

function normalizeFinancial(financial: any) {
  const base = financial?.conta ?? financial?.lancamento ?? financial?.titulo ?? financial;
  const tinyTypeRaw =
    financial?.__tinyType ??
    base?.tipo ??
    base?.natureza ??
    base?.ocorrencia ??
    'receber';
  const tinyType = String(tinyTypeRaw).toLowerCase();
  const normalizedNature = tinyType.startsWith('p') ? 'P' : 'R';
  const status = String(base?.situacao ?? financial?.situacao ?? '').toLowerCase();

  return {
    id: base?.id ?? financial?.id ?? base?.numero,
    description: base?.descricao ?? base?.historico ?? financial?.descricao,
    amount: ensureNumber(base?.valor ?? base?.valor_titulo ?? financial?.valor),
    nature: normalizedNature,
    dueDate:
      base?.data_vencimento ??
      base?.vencimento ??
      base?.data_pagamento ??
      financial?.data_vencimento ??
      financial?.data_pagamento,
    issuedDate: base?.data_emissao ?? financial?.data_emissao ?? null,
    category: base?.categoria ?? base?.conta_contabil,
    status,
    tinyType,
    parcels: extractItems(base?.parcelas).map((entry: any): ParcelInfo => {
      const parcela = entry?.parcela ?? entry;
      return {
        value: ensureNumber(parcela?.valor ?? parcela?.valor_parcela),
        dueDate: parcela?.data ?? parcela?.data_vencimento,
      };
    }),
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

  // Determina o marketplace de origem utilizando heurísticas.
  const platform = resolvePlatform(orderInput);

  if (!items.length) {
    const total =
      order.total ||
      (order.parcels?.reduce(
        (sum: number, parcela: ParcelInfo) => sum + parcela.value,
        0,
      ) ?? 0) ||
      0;
    if (!total) return [];

    return [
      {
        tenantId,
        date: issueDate,
        accrualDate: issueDate,
        debit: DEFAULT_RECEIVABLE_ACC,
        credit: DEFAULT_REVENUE_ACC,
        amount: total,
        currency: 'BRL',
        memo: `Pedido ${order.number}`,
        origin,
        sourceRef: `tiny:order:${orderId}`,
        meta: { order: orderInput, platform },
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

    let finalAmount = amount;
    if (!finalAmount) {
      const quantity = ensureNumber(normalizedItem?.quantidade ?? 1) || 1;
      const unit = ensureNumber(
        normalizedItem?.valor_unitario ??
          normalizedItem?.preco ??
          normalizedItem?.valor,
      );
      finalAmount = unit * quantity;
    }

    if (!finalAmount && order.total) {
      finalAmount = order.total / (items.length || 1);
    } else if (!finalAmount && order.parcels?.length) {
      const parcelsTotal = order.parcels.reduce(
        (sum: number, parcela: ParcelInfo) => sum + parcela.value,
        0,
      );
      finalAmount = parcelsTotal / (items.length || 1);
    }

    if (!finalAmount) {
      return null;
    }

    return {
      tenantId,
      date: issueDate,
      accrualDate: issueDate,
      debit: DEFAULT_RECEIVABLE_ACC,
      credit: account,
      amount: finalAmount,
      currency: 'BRL',
      memo: memoParts.join(' · '),
      origin,
      sourceRef: `tiny:order:${orderId}:item:${normalizedItem?.id ?? index}`,
      meta: { order: orderInput, item: normalizedItem, platform },
    };
  }).filter(Boolean) as any[];
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
    const total =
      invoice.total ||
      (invoice.parcels?.reduce(
        (sum: number, parcela: ParcelInfo) => sum + parcela.value,
        0,
      ) ?? 0) ||
      0;
    if (!total) return [];

    return [
      {
        tenantId,
        date: issueDate,
        accrualDate: issueDate,
        debit: DEFAULT_RECEIVABLE_ACC,
        credit: DEFAULT_REVENUE_ACC,
        amount: total,
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

    let finalAmount = amount;
    if (!finalAmount) {
      const quantity = ensureNumber(normalizedItem?.quantidade ?? 1) || 1;
      const unit = ensureNumber(
        normalizedItem?.valor_unitario ??
          normalizedItem?.preco ??
          normalizedItem?.valor,
      );
      finalAmount = unit * quantity;
    }

    if (!finalAmount && invoice.total) {
      finalAmount = invoice.total / (items.length || 1);
    } else if (!finalAmount && invoice.parcels?.length) {
      const parcelsTotal = invoice.parcels.reduce(
        (sum: number, parcela: ParcelInfo) => sum + parcela.value,
        0,
      );
      finalAmount = parcelsTotal / (items.length || 1);
    }

    if (!finalAmount) {
      return null;
    }

    return {
      tenantId,
      date: issueDate,
      accrualDate: issueDate,
      debit: DEFAULT_RECEIVABLE_ACC,
      credit: account,
      amount: finalAmount,
      currency: 'BRL',
      memo: memoParts.join(' · '),
      origin,
      sourceRef: `tiny:invoice:${invoiceId}:item:${normalizedItem?.id ?? index}`,
      meta: { invoice: invoiceInput, item: normalizedItem },
    };
  }).filter(Boolean) as any[];
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
  let amount = Math.abs(ensureNumber(financial.amount));
  if (!amount && financial.parcels?.length) {
    amount = financial.parcels.reduce(
      (sum: number, parcela: ParcelInfo) => sum + Math.abs(parcela.value),
      0,
    );
  }
  if (!amount || financial.status === 'cancelada') return [];
  const signedAmount = isPayable ? -amount : amount;

  const memoParts = [
    financial.description ?? 'Lançamento financeiro',
    financial.category,
  ].filter(Boolean);

  return [
    {
      tenantId,
      date,
      accrualDate: date,
      debit: isPayable ? 'Caixa/Bancos' : DEFAULT_RECEIVABLE_ACC,
      credit: isPayable ? DEFAULT_EXPENSE_ACC : DEFAULT_REVENUE_ACC,
      amount: signedAmount,
      currency: 'BRL',
      memo: memoParts.join(' · '),
      origin,
      sourceRef: `tiny:financial:${id}`,
      meta: financialInput,
    },
  ];
}
