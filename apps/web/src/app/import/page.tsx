'use client';
import { useState } from 'react';

export default function ImportPage() {
    const [file, setFile] = useState<File | null>(null);
    const [log, setLog] = useState('');

    async function upload() {
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${Process.env.NEXT_PUBLIC_API_URL}/tenants/demo-tenant/import`, { method: 'POST', body: fs});
        const j = await r.json();
        setLog(JSON.stringify(j));
    }

    return (
        <div style={{ display: 'grid', gap: 12}}>
            <h2>Importar Transactions.xlsx</h2>
            <input type="file" accept=".xlsx,.xls" onChange={e=> setFile(e.target.files?.[0] || null)} />
            <button onClick={upload}>Enviar</button>
            <pre>{log}</pre>
        </div>
    );
}
