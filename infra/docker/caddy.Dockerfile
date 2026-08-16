# syntax=docker/dockerfile:1.7
ARG CADDY_BUILD_BASE_IMAGE=golang:1.26.6-alpine3.24
ARG CADDY_RUNTIME_BASE_IMAGE=caddy:2.11.4-alpine

FROM ${CADDY_BUILD_BASE_IMAGE} AS builder
ARG TARGETOS=linux
ARG TARGETARCH=amd64
WORKDIR /src
COPY infra/caddy-build/go.mod infra/caddy-build/go.sum ./
RUN go mod download
COPY infra/caddy-build/main.go ./
RUN CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/caddy .

FROM ${CADDY_RUNTIME_BASE_IMAGE}
USER root
RUN apk upgrade --no-cache
COPY --from=builder /out/caddy /usr/bin/caddy
RUN caddy version \
    && caddy list-modules --packages | grep -Fq 'http.handlers.reverse_proxy' \
    && caddy list-modules --packages | grep -Fq 'http.encoders.zstd'
