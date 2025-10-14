export class TinyClient {
    constructor(private token: string, private baseUrl = 'https://api.tiny.com.br/api2/') {}

    async listOrders(params: { updateFrom?: string; page?: number }) {
        return this.get('/orders', params);
    }
    async listInvoices(params: { issuedFrom?: string; page?: number}) {
        return this.get('/invoices', params);
    } 
    async listFinancial(params: { duelFrom?: string; page?: number}) {
        return this.get('/financial', params);
    }
    async listChartOfAccounts() {
        return this.get('/accounts');
    }

    private async get(path: string, params?: Record<string, any>) {
        const url = new URL(this.baseUrl + path);
        url.searchParams.set('token', this.token);
        Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`Tiny error ${r.status}`);
        return r.json();
    }
}    