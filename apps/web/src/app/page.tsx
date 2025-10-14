'use client';
import Link from 'next/link';

export default function Home() {
    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <Link href="/dre">**Gráfico de Vendas** DRE</Link>
            <Link href="/import">**Importar** Importar Planilha</Link>
        </div>
    );
}