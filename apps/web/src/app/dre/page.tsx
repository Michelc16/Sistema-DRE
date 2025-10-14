'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DreFilterOptions,
  DreFilters,
  DreResponse,
} from '../../types/dre';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

const currencyFormatter = (currency: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });

function formatIsoPeriod(period: string, grouping: string) {
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return period;

  if (grouping === 'year') {
    return String(date.getUTCFullYear());
  }

  if (grouping === 'quarter') {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `T${quarter}/${date.getUTCFullYear()}`;
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

function getDefaultPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const start = `${year}-01`;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const end = `${year}-${month}`;
  return { start, end };
}

const DEFAULT_PERIOD = getDefaultPeriod();

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export default function DREPage() {
  const [filters, setFilters] = useState<DreFilters>({
    tenantId: 'demo-tenant',
    from: DEFAULT_PERIOD.start,
    to: DEFAULT_PERIOD.end,
    basis: 'competencia',
    currency: 'BRL',
    groupBy: 'month',
    pcg: [],
    types: [],
    origins: [],
    minAmount: '',
    maxAmount: '',
    search: '',
  });

  const [options, setOptions] = useState<DreFilterOptions | null>(null);
  const [data, setData] = useState<DreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchFilters() {
      setLoadingFilters(true);
      try {
        const response = await fetch(
          `${API_BASE}/dre/filters?tenantId=${filters.tenantId}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error('Não foi possível carregar filtros');
        const json: DreFilterOptions = await response.json();
        if (!active) return;
        setOptions(json);

        if (json.currencies.length && !json.currencies.includes(filters.currency)) {
          setFilters((prev) => ({ ...prev, currency: json.currencies[0] }));
        }
      } catch (err) {
        console.error(err);
        if (active) setOptions(null);
      } finally {
        if (active) setLoadingFilters(false);
      }
    }

    fetchFilters();
    return () => {
      active = false;
    };
  }, [filters.tenantId]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          tenantId: filters.tenantId,
          from: filters.from,
          to: filters.to,
          basis: filters.basis,
          currency: filters.currency,
          groupBy: filters.groupBy,
        });

        if (filters.pcg.length) params.set('pcg', filters.pcg.join(','));
        if (filters.types.length) params.set('types', filters.types.join(','));
        if (filters.origins.length)
          params.set('origins', filters.origins.join(','));
        if (filters.minAmount) params.set('minAmount', filters.minAmount);
        if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
        if (filters.search) params.set('search', filters.search);

        const response = await fetch(`${API_BASE}/dre?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Erro ao carregar dados da DRE');
        }

        const json: DreResponse = await response.json();
        setData(json);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error(err);
        setError(err.message ?? 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    return () => controller.abort();
  }, [filters]);

  const formatter = useMemo(
    () => currencyFormatter(filters.currency),
    [filters.currency],
  );

  const periodSeries = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.summary.byPeriod)
      .map(([period, total]) => ({
        period,
        total,
        label: formatIsoPeriod(period, data.meta.groupBy),
      }))
      .sort((a, b) => (a.period < b.period ? -1 : 1));
  }, [data]);

  async function exportCsv() {
    try {
      setExporting(true);
      const params = new URLSearchParams({
        tenantId: filters.tenantId,
        from: filters.from,
        to: filters.to,
        basis: filters.basis,
        currency: filters.currency,
        groupBy: filters.groupBy,
      });
      if (filters.pcg.length) params.set('pcg', filters.pcg.join(','));
      if (filters.types.length) params.set('types', filters.types.join(','));
      if (filters.origins.length) params.set('origins', filters.origins.join(','));
      if (filters.minAmount) params.set('minAmount', filters.minAmount);
      if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
      if (filters.search) params.set('search', filters.search);

      const response = await fetch(`${API_BASE}/dre/export?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Falha ao exportar DRE');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dre-${filters.tenantId}-${filters.from}-${filters.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Não foi possível exportar a DRE. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="stack">
      <header className="filters-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Painel DRE</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
              Analise o resultado financeiro com filtros avançados por período, contas gerenciais e origem.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="status-pill">
              {loading ? 'Atualizando dados...' : 'Dados atualizados'}
            </div>
            <button
              type="button"
              className="button-secondary"
              onClick={exportCsv}
              disabled={exporting || loading}
            >
              {exporting ? 'Exportando...' : 'Exportar CSV'}
            </button>
          </div>
        </div>

        <div className="filters-grid">
          <div className="field">
            <label>Tenant</label>
            <input
              value={filters.tenantId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  tenantId: event.target.value,
                }))
              }
              placeholder="Identificador do tenant"
            />
          </div>

          <div className="field">
            <label>Período inicial</label>
            <input
              type="month"
              value={filters.from}
              max={filters.to}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, from: event.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Período final</label>
            <input
              type="month"
              value={filters.to}
              min={filters.from}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, to: event.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Regime</label>
            <select
              value={filters.basis}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  basis: event.target.value as DreFilters['basis'],
                }))
              }
            >
              <option value="competencia">Competência</option>
              <option value="caixa">Caixa</option>
            </select>
          </div>

          <div className="field">
            <label>Agrupar por</label>
            <select
              value={filters.groupBy}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  groupBy: event.target.value as DreFilters['groupBy'],
                }))
              }
            >
              <option value="month">Mês</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Ano</option>
            </select>
          </div>

          <div className="field">
            <label>Moeda</label>
            <select
              value={filters.currency}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  currency: event.target.value,
                }))
              }
            >
              {[filters.currency, ...(options?.currencies ?? [])]
                .filter((value, index, array) => array.indexOf(value) === index)
                .map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label>Faixa de valor (mín.)</label>
            <input
              type="number"
              placeholder="0"
              value={filters.minAmount ?? ''}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  minAmount: event.target.value,
                }))
              }
            />
          </div>

          <div className="field">
            <label>Faixa de valor (máx.)</label>
            <input
              type="number"
              placeholder="99999"
              value={filters.maxAmount ?? ''}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  maxAmount: event.target.value,
                }))
              }
            />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Busca</label>
            <input
              placeholder="Buscar por conta, memo, referência..."
              value={filters.search ?? ''}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  search: event.target.value,
                }))
              }
            />
          </div>
        </div>
      </header>

      <section className="filters-panel">
        <h3 style={{ margin: 0 }}>Contas Gerenciais</h3>
        {loadingFilters && <p style={{ color: 'var(--text-muted)' }}>Carregando contas...</p>}
        {!loadingFilters && !options?.pcgAccounts.length && (
          <p style={{ color: 'var(--text-muted)' }}>
            Nenhuma conta gerencial cadastrada para este tenant.
          </p>
        )}
        {!!options?.pcgAccounts.length && (
          <div className="tiny-modules">
            {options.pcgAccounts.map((pcg) => {
              const value = pcg.code;
              const active = filters.pcg.includes(value);
              return (
                <label
                  key={pcg.id}
                  className={`pill-toggle ${active ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() =>
                      setFilters((prev) => ({
                        ...prev,
                        pcg: toggleValue(prev.pcg, value),
                      }))
                    }
                  />
                  <span>
                    {pcg.code} · {pcg.name}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="filters-panel">
        <div className="filters-grid">
          <div className="field">
            <label>Tipos de conta (PCG)</label>
            <div className="tiny-modules">
              {(options?.pcgTypes ?? []).map((type) => {
                const active = filters.types.includes(type);
                return (
                  <label
                    key={type}
                    className={`pill-toggle ${active ? 'active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() =>
                        setFilters((prev) => ({
                          ...prev,
                          types: toggleValue(prev.types, type),
                        }))
                      }
                    />
                    <span>{type}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Origem dos lançamentos</label>
            <div className="tiny-modules">
              {(options?.origins ?? []).map((origin) => {
                const active = filters.origins.includes(origin);
                return (
                  <label
                    key={origin}
                    className={`pill-toggle ${active ? 'active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() =>
                        setFilters((prev) => ({
                          ...prev,
                          origins: toggleValue(prev.origins, origin),
                        }))
                      }
                    />
                    <span>{origin}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {data && !error && (
        <>
          <section className="metric-cards">
            <article className="metric-card">
              <span>Total consolidado</span>
              <strong>{formatter.format(data.summary.total)}</strong>
            </article>
            <article className="metric-card">
              <span>Período analisado</span>
              <strong>
                {filters.from} → {filters.to}
              </strong>
            </article>
            <article className="metric-card">
              <span>Lançamentos filtrados</span>
              <strong>{data.rows.reduce((acc, row) => acc + row.entries, 0)}</strong>
            </article>
            <article className="metric-card">
              <span>Regime</span>
              <strong>{filters.basis === 'caixa' ? 'Caixa' : 'Competência'}</strong>
            </article>
          </section>

          <section className="dre-trend">
            <h3 style={{ margin: '0 0 16px' }}>Evolução por período</h3>
            {periodSeries.length ? (
              <TrendChart
                data={periodSeries}
                formatValue={(value) => formatter.format(value)}
              />
            ) : (
              <div className="chart-empty">Sem dados neste intervalo.</div>
            )}
          </section>

          <section className="table-card">
            <div
              style={{
                padding: '16px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0 }}>Detalhamento</h3>
              <span style={{ color: 'var(--text-muted)' }}>
                {data.rows.length} linhas agregadas
              </span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Conta PCG</th>
                    <th>Tipo</th>
                    <th>Lançamentos</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr key={`${row.period}-${row.pcgCode}-${index}`}>
                      <td>{formatIsoPeriod(row.period, data.meta.groupBy)}</td>
                      <td>
                        <strong>{row.pcgCode ?? '-'}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          {row.pcgName ?? 'Sem mapeamento'}
                        </span>
                      </td>
                      <td>{row.pcgType ?? '-'}</td>
                      <td>{row.entries}</td>
                      <td style={{ textAlign: 'right' }}>
                        {formatter.format(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TrendChart({
  data,
  formatValue,
}: {
  data: Array<{ period: string; total: number; label: string }>;
  formatValue: (value: number) => string;
}) {
  if (!data.length) return null;

  const values = data.map(({ total }) => total);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = data.map((item, index) => {
    const x = (index / (data.length - 1 || 1)) * 100;
    const y = 100 - ((item.total - min) / range) * 100;
    return `${x},${y}`;
  });

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ width: '100%', height: 220 }}>
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(37, 99, 235, 0.35)" />
            <stop offset="100%" stopColor="rgba(37, 99, 235, 0.02)" />
          </linearGradient>
        </defs>
        <polyline
          fill="url(#trendGradient)"
          stroke="none"
          points={`0,100 ${points.join(' ')} 100,100`}
        />
        <polyline
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.6"
          points={points.join(' ')}
        />
      </svg>
      <div
        style={{
          display: 'grid',
          gap: 8,
          marginTop: 12,
          gridTemplateColumns: `repeat(${data.length}, minmax(60px, 1fr))`,
        }}
      >
        {data.map((item) => (
          <div key={item.period} style={{ textAlign: 'center' }}>
            <strong style={{ display: 'block' }}>{item.label}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {formatValue(item.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
