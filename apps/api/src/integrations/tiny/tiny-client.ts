export interface TinyListParams {
  updateFrom?: string;
  issuedFrom?: string;
  dueFrom?: string;
  page?: number;
  pageSize?: number;
}

export class TinyClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.tiny.com.br/api2/',
  ) {}

  async listOrders(params: TinyListParams = {}) {
    return this.get('orders', params);
  }

  async listInvoices(params: TinyListParams = {}) {
    return this.get('invoices', params);
  }

  async listFinancial(params: TinyListParams = {}) {
    return this.get('financial', params);
  }

  async listChartOfAccounts() {
    return this.get('accounts');
  }

  private async get(resource: string, params: Record<string, any> = {}) {
    const url = new URL(`${this.baseUrl}${resource}.json`);
    url.searchParams.set('token', this.token);
    url.searchParams.set('format', 'json');
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Tiny ERP error ${response.status} (${response.statusText}): ${body}`,
      );
    }

    return response.json();
  }
}
