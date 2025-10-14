import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Navigation } from '../components/navigation';

export const metadata = {
  title: 'Sistema DRE',
  description: 'Gestão financeira com DRE analítica e integrações',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="app-header__inner">
              <Link href="/" className="brand">
                <span className="brand__logo">D</span>
                <span>Sistema DRE</span>
              </Link>
              <Navigation />
            </div>
          </header>
          <main className="app-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
