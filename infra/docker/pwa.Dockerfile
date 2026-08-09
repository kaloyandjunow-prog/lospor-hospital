# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS builder
WORKDIR /workspace
COPY vendor/lospor-core ./vendor/lospor-core
COPY apps/pwa/package.json apps/pwa/package-lock.json apps/pwa/.npmrc ./apps/pwa/
COPY apps/pwa/patches ./apps/pwa/patches
RUN npm ci --prefix apps/pwa
COPY apps/pwa ./apps/pwa
WORKDIR /workspace/apps/pwa
ENV EXPO_PUBLIC_API_BASE=
RUN npm run export:web

FROM nginx:1.29.1-alpine AS runner
COPY infra/nginx/pwa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/pwa/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/"]
