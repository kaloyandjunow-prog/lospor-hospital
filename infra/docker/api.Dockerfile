# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS dependencies
WORKDIR /workspace

COPY vendor/lospor-core ./vendor/lospor-core
COPY vendor/exchange-contract/package.json vendor/exchange-contract/package-lock.json ./vendor/exchange-contract/
RUN npm ci --prefix vendor/exchange-contract
COPY vendor/exchange-contract ./vendor/exchange-contract
RUN npm run build --prefix vendor/exchange-contract

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN npm ci --prefix apps/api

FROM dependencies AS builder
COPY apps/api ./apps/api
WORKDIR /workspace/apps/api
RUN npx prisma generate
RUN npm run build

FROM dependencies AS migrator
COPY apps/api ./apps/api
WORKDIR /workspace/apps/api
RUN npx prisma generate
ENTRYPOINT ["npx", "prisma", "migrate", "deploy"]

FROM builder AS tools
WORKDIR /workspace/apps/api
ENTRYPOINT []

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 lospor \
  && useradd --system --uid 1001 --gid lospor --create-home lospor
WORKDIR /app
COPY --from=builder --chown=lospor:lospor /workspace/apps/api/.next/standalone ./
COPY --from=builder --chown=lospor:lospor /workspace/apps/api/.next/static ./apps/api/.next/static
RUN mkdir -p /var/lib/lospor/central-exports /var/lib/lospor/research-exports \
  && chown -R lospor:lospor /var/lib/lospor
USER lospor
WORKDIR /app/apps/api
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
