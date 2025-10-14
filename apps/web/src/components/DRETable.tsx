export function DRETable({ data }: { data: any }) {
    const rows = data.rows || [];
    return (
        <div style={{ borderRadiues: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.1)', padding: 12, marginTop: 12}}>
            <table style={{ width: '100%', fontSize:14 }}>
                <thead>
                    <tr><th style={{ textAlign: 'left' }}>Conta (PCG)</th><th>Período</th><th>Total</th></tr>
                </thead>
                <tbody>
                    {rows.map((r: any, i: number) => (
                        <tr key={i}>
                            <td> {r.pcg || '-'}</td>
                            <td>{new Date(r.period).toISOString().slice(0,7)}</td>
                            <td style={{ textAlign: 'right' }}>{Number(r.total).toLocaleString('pt-BR',{ style: 'currency', currency:'BRL'})}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}