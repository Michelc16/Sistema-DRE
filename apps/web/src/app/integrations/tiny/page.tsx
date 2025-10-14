'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

type ModuleKind = 'orders' | 'invoices' | 'financial';

const MODULES: Array<{ id: ModuleKind; label: string; hint: string }> = [
  { id: 'orders', label: 'Pedidos', hint: 'Itens e pedidos de venda' },
  { id: 'invoices', label: 'Notas fiscais', hint: 'Notas faturadas' },
  { id: 'financial', label: 'Financeiro', hint: 'Contas a pagar/receber' },
];

interface SyncResult {
  status: 'idle' | 'syncing' | 'success' | 'error';
  message: string;
  payload?: unknown;
}

interface TinyStatus {
  enabled: boolean;
  modules: ModuleKind[];
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  syncFrequency?: number | null;
}

function getDefaultFrom() {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export default function TinyIntegrationPage() {
  const [tenantId, setTenantId] = useState('demo-tenant');
  const [token, setToken] = useState('');
  const [modules, setModules] = useState<ModuleKind[]>(['orders']);
  const [from, setFrom] = useState(getDefaultFrom());
  const [pageSize, setPageSize] = useState(50);
  const [autoSync, setAutoSync] = useState(true);
  const [frequency, setFrequency] = useState(1440);
  const [status, setStatus] = useState<TinyStatus | null>(null);
  const [result, setResult] = useState<SyncResult>({
    status: 'idle',
    message: '',
  });
  const [loadingStatus, setLoadingStatus] = useState(false);

  const modulesSummary = useMemo(
    () =>
      MODULES.filter((module) => modules.includes(module.id))
        .map((module) => module.label)
        .join(', '),
    [modules],
  );

  const toggleModule = (value: ModuleKind) => {
    setModules((prev) =>
      prev.includes(value)
        ? prev.filter((module) => module !== value)
        : [...prev, value],
    );
  };

  const loadStatus = async (tenant = tenantId) => {
    try {
      setLoadingStatus(true);
      const response = await fetch(
        `${API_BASE}/tenants/${encodeURIComponent(tenant)}/tiny/status`,
        { cache: 'no-store' },
      );
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload) return;
      if (payload.modules) {
        setModules(
          payload.modules.filter((module: string): module is ModuleKind =>
            ['orders', 'invoices', 'financial'].includes(module),
          ),
        );
      }
      if (payload.syncFrequency) setFrequency(payload.syncFrequency);
      if (typeof payload.enabled === 'boolean') setAutoSync(payload.enabled);
      setStatus({
        enabled: payload.enabled ?? true,
        modules: payload.modules ?? [],
        lastSyncAt: payload.lastSyncAt,
        nextSyncAt: payload.nextSyncAt,
        syncFrequency: payload.syncFrequency,
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const saveConfig = async () => {
    if (!token.trim()) {
      setResult({
        status: 'error',
        message: 'Informe o token do Tiny antes de salvar a configuração.',
      });
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/tenants/${encodeURIComponent(tenantId)}/tiny/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            token,
            modules,
            enabled: autoSync,
            syncFrequency: frequency,
          }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message ?? 'Falha ao salvar configuração.');
      }

      setResult({
        status: 'success',
        message: 'Configuração salva. A sincronização automática usará essas definições.',
      });
      loadStatus();
    } catch (err: any) {
      setResult({
        status: 'error',
        message: err?.message ?? 'Erro ao salvar configurações.',
      });
    }
  };

  const sync = async () => {
    if (!token.trim()) {
      setResult({
        status: 'error',
        message: 'Informe o token de API do Tiny ERP.',
      });
      return;
    }

    if (!modules.length) {
      setResult({
        status: 'error',
        message: 'Selecione ao menos um módulo para sincronizar.',
      });
      return;
    }

    setResult({
      status: 'syncing',
      message: `Sincronizando ${modulesSummary.toLowerCase()}...`,
    });

    try {
      const encodedTenant = encodeURIComponent(tenantId);
      const response = await fetch(
        `${API_BASE}/tenants/${encodedTenant}/tiny/sync`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            modules,
            from,
            pageSize,
          }),
        },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload?.message ?? 'Não foi possível concluir a sincronização.',
        );
      }

      setResult({
        status: 'success',
        message: 'Integração concluída com sucesso.',
        payload,
      });
      loadStatus();
    } catch (err: any) {
      setResult({
        status: 'error',
        message: err?.message ?? 'Erro ao comunicar com o Tiny ERP.',
      });
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  return (
    <div className="stack">
      <header className="filters-panel">
        <div>
          <h2 style={{ margin: 0 }}>Integração Tiny ERP</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
            Sincronize pedidos, notas e lançamentos financeiros do Tiny
            diretamente para o DRE.
          </p>
        </div>

        <div className="filters-grid">
          <div className="field">
            <label>Tenant</label>
            <input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="Identificador do tenant"
            />
          </div>

          <div className="field">
            <label>Token Tiny ERP</label>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Informe o token do Tiny"
            />
          </div>

          <div className="field">
            <label>Sincronizar a partir de</label>
            <input
              type="month"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div className="field">
            <label>Itens por página</label>
            <input
              type="number"
              min={10}
              max={150}
              step={10}
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value) || 50)}
            />
          </div>

          <div className="field">
            <label>Frequência (minutos)</label>
            <input
              type="number"
              min={60}
              step={60}
              value={frequency}
              onChange={(event) => setFrequency(Number(event.target.value) || 1440)}
            />
          </div>

          <div className="field">
            <label>Sincronização automática</label>
            <label className={`pill-toggle ${autoSync ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(event) => setAutoSync(event.target.checked)}
              />
              <span>{autoSync ? 'Ativa (executa a cada 24h)' : 'Desativada'}</span>
            </label>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Módulos para sincronizar</label>
          <div className="tiny-modules">
            {MODULES.map((module) => {
              const active = modules.includes(module.id);
              return (
                <label
                  key={module.id}
                  className={`pill-toggle ${active ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleModule(module.id)}
                  />
                  <span>
                    {module.label}
                    <small style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {module.hint}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="hero-actions" style={{ justifyContent: 'flex-end' }}>
          <button
            className="button-secondary"
            type="button"
            onClick={saveConfig}
            disabled={result.status === 'syncing'}
          >
            Salvar configuração
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={sync}
            disabled={result.status === 'syncing'}
          >
            {result.status === 'syncing' ? 'Sincronizando...' : 'Executar integração'}
          </button>
        </div>
      </header>

      {result.status !== 'idle' && (
        <section className="card">
          <h3 style={{ margin: '0 0 8px' }}>Status</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)' }}>
            {loadingStatus
              ? 'Carregando status...'
              : `Última sincronização: ${formatDate(status?.lastSyncAt)} · Próxima: ${formatDate(status?.nextSyncAt)}`}
          </p>
          <p
            style={{
              margin: 0,
              color:
                result.status === 'success'
                  ? 'var(--success)'
                  : result.status === 'error'
                  ? 'var(--danger)'
                  : 'var(--text-muted)',
            }}
          >
            {result.message}
          </p>
          {result.payload && (
            <pre className="tiny-log">
              {JSON.stringify(result.payload, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
