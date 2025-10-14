export interface TinySearchParams {
  updateFrom?: string;
  issuedFrom?: string;
  dueFrom?: string;
  page?: number;
  pageSize?: number;
}

type TinyEndpoint =
  | 'pedidos.pesquisa.php'
  | 'pedidos.pesquisar.php'
  | 'notas.pesquisa.php'
  | 'notas.pesquisar.php'
  | 'financeiro.lancamentos.pesquisa.php';

export class TinyClient {
  private readonly baseUrl: string;

  constructor(private readonly token: string, baseUrl = 'https://api.tiny.com.br/api2/') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async searchOrders(params: TinySearchParams = {}) {
    return this.post(
      ['pedidos.pesquisa.php', 'pedidos.pesquisar.php'],
      this.mapParams(params),
    );
  }

  async searchInvoices(params: TinySearchParams = {}) {
    return this.post(
      ['notas.pesquisa.php', 'notas.pesquisar.php'],
      this.mapParams(params),
    );
  }

  async searchFinancial(params: TinySearchParams = {}) {
    return this.post(['financeiro.lancamentos.pesquisa.php'], this.mapParams(params, { dueFromKey: 'dataIni' }));
  }

  private mapParams(
    params: TinySearchParams,
    overrides?: { dueFromKey?: string },
  ) {
    const mapped: Record<string, string> = {
      formato: 'json',
    };

    if (params.page) mapped.pagina = String(params.page);
    if (params.pageSize) mapped.limite = String(params.pageSize);
    if (params.updateFrom) mapped.dataInicial = params.updateFrom;
    if (params.issuedFrom) mapped.dataInicial = params.issuedFrom;
    if (params.dueFrom) {
      const key = overrides?.dueFromKey ?? 'dataInicial';
      mapped[key] = params.dueFrom;
    }

    return mapped;
  }

  private async post(endpoints: TinyEndpoint[], bodyParams: Record<string, string>) {
    const payload = new URLSearchParams({
      token: this.token,
      ...bodyParams,
    }).toString();

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      const url = `${this.baseUrl}${endpoint}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json',
          },
          body: payload,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Tiny ERP error ${response.status} (${response.statusText}): ${text}`);
        }

        return await response.json();
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error('Tiny ERP request failed');
  }
}
