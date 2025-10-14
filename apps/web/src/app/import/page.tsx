'use client';

import { useState } from 'react';
import { FileDrop } from '../../components/FileDrop';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

interface ImportLog {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message: string;
  payload?: unknown;
}

export default function ImportPage() {
  const [tenantId, setTenantId] = useState('demo-tenant');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [log, setLog] = useState<ImportLog>({ status: 'idle', message: '' });

  const handleUpload = async () => {
    if (!selectedFile) {
      setLog({
        status: 'error',
        message: 'Selecione um arquivo antes de enviar.',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setLog({ status: 'uploading', message: 'Enviando arquivo...' });

    try {
      const response = await fetch(
        `${API_BASE}/tenants/${tenantId}/import`,
        {
          method: 'POST',
          body: formData,
        },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload?.message ?? 'Não foi possível processar a planilha.',
        );
      }

      setLog({
        status: 'success',
        message: 'Importação concluída.',
        payload,
      });
    } catch (err: any) {
      setLog({
        status: 'error',
        message: err?.message ?? 'Falha ao enviar o arquivo.',
      });
    }
  };

  return (
    <div className="stack">
      <header className="filters-panel">
        <div>
          <h2 style={{ margin: 0 }}>Importar planilha de transações</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
            Faça upload de um arquivo XLSX para incluir lançamentos na DRE.
            Utilizamos a primeira aba ou uma aba chamada "Transactions".
          </p>
        </div>

        <div className="filters-grid">
          <div className="field">
            <label>Tenant</label>
            <input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="Informe o ID do tenant"
            />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Arquivo XLSX</label>
            <FileDrop
              accept=".xlsx,.xls"
              onFiles={(files) => setSelectedFile(files[0])}
              label={
                selectedFile
                  ? `Selecionado: ${selectedFile.name}`
                  : 'Arraste seu arquivo (XLSX) ou clique para localizar'
              }
            />
          </div>
        </div>

        <div className="hero-actions" style={{ justifyContent: 'flex-end' }}>
          <button
            className="button-primary"
            type="button"
            onClick={handleUpload}
            disabled={log.status === 'uploading'}
          >
            {log.status === 'uploading' ? 'Importando...' : 'Importar planilha'}
          </button>
        </div>
      </header>

      {log.status !== 'idle' && (
        <section className="card">
          <h3 style={{ margin: 0 }}>Status da importação</h3>
          <p
            style={{
              margin: 0,
              color:
                log.status === 'success'
                  ? 'var(--success)'
                  : log.status === 'error'
                  ? 'var(--danger)'
                  : 'var(--text-muted)',
            }}
          >
            {log.message}
          </p>
          {log.payload && (
            <pre className="tiny-log">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
