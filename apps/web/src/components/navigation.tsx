'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Visão Geral' },
  { href: '/dre', label: 'DRE Analítica' },
  { href: '/import', label: 'Importar Planilha' },
  { href: '/integrations/tiny', label: 'Integração Tiny' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="app-nav">
      {LINKS.map((link) => {
        const isActive =
          link.href === '/'
            ? pathname === link.href
            : pathname?.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={isActive ? 'active' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
