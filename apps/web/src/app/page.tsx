import Link from 'next/link';

const featureCards = [
  {
    title: 'DRE Analítica',
    description:
      'Explore receitas, despesas e margens com filtros avançados de período, conta e origem.',
    href: '/dre',
    cta: 'Abrir painel DRE',
  },
  {
    title: 'Importação por Planilha',
    description:
      'Traga lançamentos financeiros a partir da sua planilha XLSX com validação e log do processamento.',
    href: '/import',
    cta: 'Importar agora',
  },
  {
    title: 'Integração Tiny ERP',
    description:
      'Sincronize pedidos, notas fiscais e lançamentos financeiros diretamente do Tiny ERP.',
    href: '/integrations/tiny',
    cta: 'Configurar integração',
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>DRE moderna para decisões mais rápidas</h1>
          <p>
            Analise o desempenho da empresa com uma visão financeira completa,
            importação de dados em massa e integração nativa com o Tiny ERP.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/dre" className="button-primary">
            Acessar painel DRE
          </Link>
          <Link href="/integrations/tiny" className="button-secondary">
            Configurar Tiny ERP
          </Link>
        </div>
      </section>

      <section className="card-grid">
        {featureCards.map((card) => (
          <article key={card.title} className="card">
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <Link href={card.href} className="button-secondary">
              {card.cta}
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}
