FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm i -g pnpm && pnpm i --ignore-scripts
COPY . .
RUN pnpm build || npm run build
EXPOSE 4000
CMD ["npm","run","start"]