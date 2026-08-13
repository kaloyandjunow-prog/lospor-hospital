# syntax=docker/dockerfile:1.7
ARG NODE_STATUS_BASE_IMAGE=node:24-bookworm-slim
FROM ${NODE_STATUS_BASE_IMAGE} AS dependencies
WORKDIR /workspace/apps/status
COPY apps/status/package.json apps/status/package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY apps/status/ ./
RUN npm run build \
  && npm prune --omit=dev

FROM ${NODE_STATUS_BASE_IMAGE} AS runner
ENV NODE_ENV=production
ENV STATUS_HTTP_PORT=3004
ENV STATUS_HTTPS_PORT=3443
ENV STATUS_DATABASE_PATH=/data/status.sqlite
RUN groupadd --system --gid 1001 lospor \
  && useradd --system --uid 1001 --gid lospor --create-home lospor \
  && mkdir -p /app /data \
  && chown -R lospor:lospor /app /data
WORKDIR /app
COPY --from=builder --chown=lospor:lospor /workspace/apps/status/package.json ./
COPY --from=builder --chown=lospor:lospor /workspace/apps/status/node_modules ./node_modules
COPY --from=builder --chown=lospor:lospor /workspace/apps/status/dist ./dist
USER lospor
EXPOSE 3004 3443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3004/internal/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
