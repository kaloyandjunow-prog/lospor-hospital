# syntax=docker/dockerfile:1.7
# Development uses the named Alpine image. Release CI overrides this argument
# with an approved linux/amd64 digest and records it in the immutable release lock.
ARG NODE_API_BASE_IMAGE=node:24-alpine3.24
FROM ${NODE_API_BASE_IMAGE} AS dependencies
WORKDIR /workspace

# Prisma's schema engine needs the OpenSSL executable while generating and
# deploying the client. The shared OpenSSL libraries are already part of the
# official Node Alpine image; install only the small CLI package here.
RUN apk add --no-cache openssl

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
RUN node node_modules/prisma/build/index.js generate
RUN npm run build

# The migrator and tools need the locally installed Prisma/tsx binaries, but
# they must not carry a second, globally invokable package manager into a
# hospital. Start from the generated build tree and remove npm and Corepack.
FROM builder AS hardened-tooling
RUN rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

FROM hardened-tooling AS migrator
ENTRYPOINT ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM hardened-tooling AS tools
WORKDIR /workspace/apps/api
ENTRYPOINT []

FROM ${NODE_API_BASE_IMAGE} AS runner
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
RUN rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -S -g 1001 lospor \
  && adduser -S -D -u 1001 -G lospor -h /home/lospor lospor
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
