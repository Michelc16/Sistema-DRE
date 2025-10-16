/**
 * Parâmetros de busca para os serviços do Tiny. Além de paginação, permitem
 * filtrar os registros por data de emissão e por data de atualização.
 *
 * - page       → número da página (inicia em 1)
 * - pageSize   → quantidade de registros por página (padrão definido no serviço)
 * - updateFrom → data inicial para filtrar registros atualizados (YYYY-MM-DD)
 * - updateTo   → data final para filtrar registros atualizados (YYYY-MM-DD)
 * - issuedFrom → data inicial para filtrar registros emitidos (YYYY-MM-DD)
 * - issuedTo   → data final para filtrar registros emitidos (YYYY-MM-DD)
 */
type SearchParams = {
  page?: number;
  pageSize?: number;
  updateFrom?: string;
  updateTo?: string;
  issuedFrom?: string;
  issuedTo?: string;
  /**
   * Data inicial de vencimento para contas a receber/pagar (YYYY-MM-DD).
   * Opcional. Usado para filtrar contas pelo vencimento quando necessário.
   */
  dueFrom?: string;
  /**
   * Data final de vencimento para contas a receber/pagar (YYYY-MM-DD).
   * Opcional. Usado para filtrar contas pelo vencimento quando necessário.
   */
  dueTo?: string;
};

export class TinyClient {
  private readonly baseUrl: string;

  constructor(private readonly token: string, baseUrl = 'https://api.tiny.com.br/api2/') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async searchOrders(params: SearchParams = {}) {
    return this.callSearch('pedidos.pesquisa.php', params, 'pedidos', 'pedido');
  }

  async getOrderDetail(summary: any) {
    return this.callDetail('pedido.obter.php', summary, ['id', 'pedido_id', 'numero']);
  }

  async searchInvoices(params: SearchParams = {}) {
    return this.callSearch('notas.fiscais.pesquisa.php', params, 'notas_fiscais', 'nota_fiscal');
  }

  async getInvoiceDetail(summary: any) {
    return this.callDetail('nota.fiscal.obter.php', summary, ['id', 'nota_id', 'numero']);
  }

  async searchReceivables(params: SearchParams = {}) {
    const data = await this.callSearch(
      'contas.receber.pesquisa.php',
      params,
      'contas_receber',
      'conta_receber',
    );
    return data.map((item: any) => ({ ...item, __tinyType: 'receber' }));
  }

  async getReceivableDetail(summary: any) {
    const detail = await this.callDetail(
      'conta.receber.obter.php',
      summary,
      ['id', 'conta_id', 'documento', 'numero'],
    );
    return detail ? { ...detail, __tinyType: 'receber' } : summary;
  }

  async searchPayables(params: SearchParams = {}) {
    const data = await this.callSearch(
      'contas.pagar.pesquisa.php',
      params,
      'contas_pagar',
      'conta_pagar',
    );
    return data.map((item: any) => ({ ...item, __tinyType: 'pagar' }));
  }

  async getPayableDetail(summary: any) {
    const detail = await this.callDetail(
      'conta.pagar.obter.php',
      summary,
      ['id', 'conta_id', 'documento', 'numero'],
    );
    return detail ? { ...detail, __tinyType: 'pagar' } : summary;
  }

  private async callSearch(
    endpoint: string,
    params: SearchParams,
    pluralKey: string,
    singularKey: string,
  ) {
    const payload = new URLSearchParams({
      token: this.token,
      formato: 'json',
    });

    if (params.page) payload.set('pagina', String(params.page));
    if (params.pageSize) payload.set('limite', String(params.pageSize));
    // Mapeia filtros de atualização/emissão/vencimento conforme a documentação do Tiny:
    // Para pedidos/notas fiscais:
    //   dataAtualizacao/dataFinalAtualizacao → intervalo de atualização
    //   dataInicial/dataFinal → intervalo de emissão
    // Para contas a receber/pagar:
    //   data_ini_emissao/data_fim_emissao → intervalo de emissão
    //   data_ini_vencimento/data_fim_vencimento → intervalo de vencimento
    const isFinancial =
      endpoint.startsWith('contas.receber') || endpoint.startsWith('contas.pagar');

    // Função para converter data ISO (YYYY-MM-DD) em dd/mm/yyyy, conforme documentação.
    const toTinyDate = (isoDate: string) => {
      const parts = isoDate?.split('-');
      return parts && parts.length === 3
        ? `${parts[2]}/${parts[1]}/${parts[0]}`
        : isoDate;
    };

    if (isFinancial) {
      // Filtros de emissão para contas a receber/pagar
      if (params.issuedFrom) payload.set('data_ini_emissao', toTinyDate(params.issuedFrom));
      if (params.issuedTo) payload.set('data_fim_emissao', toTinyDate(params.issuedTo));
      // Filtros de vencimento para contas a receber/pagar
      const dueStart = params.dueFrom ?? params.updateFrom;
      const dueEnd = params.dueTo ?? params.updateTo;
      if (dueStart) payload.set('data_ini_vencimento', toTinyDate(dueStart));
      if (dueEnd) payload.set('data_fim_vencimento', toTinyDate(dueEnd));
    } else {
      // Filtros de atualização e emissão para pedidos/notas
      if (params.updateFrom) payload.set('dataAtualizacao', params.updateFrom);
      if (params.updateTo) payload.set('dataFinalAtualizacao', params.updateTo);
      if (params.issuedFrom) payload.set('dataInicial', params.issuedFrom);
      if (params.issuedTo) payload.set('dataFinal', params.issuedTo);
    }

    const response = await this.post(endpoint, payload);
    const root = response?.retorno ?? response ?? {};
    return this.unwrapCollection(root, pluralKey, singularKey);
  }

  private async callDetail(endpoint: string, summary: any, keys: string[]) {
    const id = this.resolveDetailId(summary, keys);
    if (!id) return summary;

    const payload = new URLSearchParams({
      token: this.token,
      formato: 'json',
      id: String(id),
    });

    try {
      const response = await this.post(endpoint, payload);
      const root = response?.retorno ?? response ?? {};
      switch (endpoint) {
        case 'pedido.obter.php':
          return root.pedido ?? response?.pedido ?? summary;
        case 'nota.fiscal.obter.php':
          return root.nota_fiscal ?? response?.nota_fiscal ?? summary;
        case 'conta.receber.obter.php':
          return (
            root.conta_receber ??
            root.conta ??
            response?.conta_receber ??
            response?.conta ??
            summary
          );
        case 'conta.pagar.obter.php':
          return (
            root.conta_pagar ??
            root.conta ??
            response?.conta_pagar ??
            response?.conta ??
            summary
          );
        default:
          return response ?? summary;
      }
    } catch {
      return summary;
    }
  }

  private async post(endpoint: string, payload: URLSearchParams) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tiny ERP error ${response.status} (${response.statusText}): ${text}`);
    }

    return response.json();
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

  private resolveDetailId(summary: any, keys: string[]) {
    for (const key of keys) {
      const value =
        summary?.[key] ??
        summary?.[this.camelToSnake(key)] ??
        summary?.[key.toUpperCase()] ??
        summary?.[key.toLowerCase()];
      if (value) return value;
      if (summary?.pedido?.[key]) return summary.pedido[key];
      if (summary?.nota?.[key]) return summary.nota[key];
      if (summary?.conta?.[key]) return summary.conta[key];
    }
    return undefined;
  }

  private camelToSnake(value: string) {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
