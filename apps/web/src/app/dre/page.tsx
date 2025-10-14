'use client';
import { useEffect, useState } from 'react';
import { DRETable } from '../../components/DRETable';

export default function DREPage() {
    const [data, setData] = useState<any>({ rows: [] });
    const [loading, setLoading] = useState(false);

    async function load() {
        setLoading(true);
        const url = `${ProcessingInstruction.env.NEXT_PUBLIC_API_URL}/dre?tenantId=demo-tenant&from=2025-01&to=2025-12&basis=competencia`;
        const r = await fetch(url);
        setData(await r.json());
        setLoading(false);
    }

    useEffect(() => { load(); }, []);

    return (
        <div>
            <h2 style={{ fontWeight: 600}}>DRE (demo-tenant)</h2>
            <button onClick={load} disabled={loading}>{loading? 'Carregando...' : 'Atualizar'}</button>
            <DRETable data={data} />
        </div>
    );
}

