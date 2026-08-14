# syntax=docker/dockerfile:1.7
ARG NODE_BROWSER_BASE_IMAGE=node:24-alpine3.24
FROM ${NODE_BROWSER_BASE_IMAGE} AS dependencies
WORKDIR /workspace
COPY vendor/lospor-core ./vendor/lospor-core
COPY apps/browser/package.json apps/browser/package-lock.json ./apps/browser/
RUN npm ci --prefix apps/browser

FROM dependencies AS builder
COPY apps/browser ./apps/browser
WORKDIR /workspace/apps/browser
ENV LOSPOR_API_INTERNAL_URL=http://api:3002
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${NODE_BROWSER_BASE_IMAGE} AS runner
ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
RUN rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -S -g 1001 lospor \
  && adduser -S -D -u 1001 -G lospor -h /home/lospor lospor
WORKDIR /app
COPY --from=builder --chown=lospor:lospor /workspace/apps/browser/.next/standalone ./
COPY --from=builder --chown=lospor:lospor /workspace/apps/browser/.next/static ./apps/browser/.next/static
COPY --from=builder --chown=lospor:lospor /workspace/apps/browser/public ./apps/browser/public
USER lospor
WORKDIR /app/apps/browser
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3003').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
