export const metadata = { title: 'DRE', description: 'Sistema DRE' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR">
            <body style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
                <div style={{ maxWidth: 1080, margin: '0 auto', padding: 16 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700}}>Sistema DRE</h1>
                    {children}
                </div>
            </body>
        </html>
    );
}