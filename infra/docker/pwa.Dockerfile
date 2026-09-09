# syntax=docker/dockerfile:1.7
ARG NODE_PWA_BUILD_BASE_IMAGE=node:24-alpine3.24
ARG NGINX_PWA_BASE_IMAGE=nginx:1.30.4-alpine
FROM ${NODE_PWA_BUILD_BASE_IMAGE} AS builder
WORKDIR /workspace
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
COPY vendor/lospor-core ./vendor/lospor-core
COPY apps/pwa/package.json apps/pwa/package-lock.json apps/pwa/.npmrc ./apps/pwa/
COPY apps/pwa/patches ./apps/pwa/patches
RUN npm ci --prefix apps/pwa
COPY apps/pwa ./apps/pwa
WORKDIR /workspace/apps/pwa
ENV EXPO_PUBLIC_API_BASE=
RUN npm run export:web

FROM ${NGINX_PWA_BASE_IMAGE} AS runner
RUN apk upgrade --no-cache
COPY infra/nginx/pwa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/pwa/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/"]
