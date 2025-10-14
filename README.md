# Sistema DRE - Monorepo

## Requisitos
-Node.js 18+
-pnpm (recomendado) ou npm
-Docker + docker-compose

## Setup rápido
'''bash
docker-compose up -d
# em outro terminal
pnpm install # ou npm install
pnpm --filter @dre/api prisma migrate dev
pnpm dev

* API: http://localhost:4000/v1/health
* Web: http://localhost:3000

### '.env.example'
'''env
#Raiz (vazio de propósito). Use env específicos em apps/api e apps/web