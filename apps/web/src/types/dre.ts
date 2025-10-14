export type DreGrouping = 'month' | 'quarter' | 'year';

export interface DreRow {
  period: string;
  pcgCode: string | null;
  pcgName: string | null;
  pcgType: string | null;
  total: number;
  entries: number;
}

export interface DreSummary {
  total: number;
  byType: Record<string, number>;
  byPeriod: Record<string, number>;
  byPcg: Record<string, number>;
}

export interface DreMeta {
  tenantId: string;
  from: string;
  to: string;
  basis: 'caixa' | 'competencia';
  currency: string;
  groupBy: DreGrouping;
}

export interface DreResponse {
  rows: DreRow[];
  summary: DreSummary;
  meta: DreMeta;
}

export interface DreFilterOptions {
  pcgAccounts: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
  }>;
  pcgTypes: string[];
  origins: string[];
  currencies: string[];
  bases: Array<'caixa' | 'competencia'>;
  groupings: DreGrouping[];
}

export interface DreFilters {
  tenantId: string;
  from: string;
  to: string;
  basis: 'caixa' | 'competencia';
  currency: string;
  groupBy: DreGrouping;
  pcg: string[];
  types: string[];
  origins: string[];
  minAmount?: string;
  maxAmount?: string;
  search?: string;
}
