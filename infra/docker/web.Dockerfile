# syntax=docker/dockerfile:1.7
ARG NODE_WEB_BASE_IMAGE=node:24-alpine3.24
FROM ${NODE_WEB_BASE_IMAGE} AS dependencies
WORKDIR /workspace
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
COPY vendor/lospor-core ./vendor/lospor-core
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN npm ci --prefix apps/web

FROM dependencies AS builder
COPY apps/web ./apps/web
WORKDIR /workspace/apps/web
# Nothing hospital-specific may be baked in here: one published image has to run
# unmodified at every site. The CORS build argument that used to live here was
# never load-bearing — next.config.ts only throws on a missing value when
# VERCEL_ENV is "production", which it never is in the appliance, and the header
# it feeds exists solely for a legacy compatibility proxy. Real CORS is enforced
# by the API from its runtime environment.
#
# The API address is a Docker service name, identical at every site, and the PWA
# redirect target (MOBILE_PWA_URL) is read at runtime by src/proxy.ts.
ENV LOSPOR_API_INTERNAL_URL=http://api:3002
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${NODE_WEB_BASE_IMAGE} AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk upgrade --no-cache \
  && rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -S -g 1001 lospor \
  && adduser -S -D -u 1001 -G lospor -h /home/lospor lospor
WORKDIR /app
COPY --from=builder --chown=lospor:lospor /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=lospor:lospor /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=lospor:lospor /workspace/apps/web/public ./apps/web/public
USER lospor
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
