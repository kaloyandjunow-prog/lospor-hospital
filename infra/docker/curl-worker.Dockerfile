# syntax=docker/dockerfile:1.7
# Release CI replaces this default with the approved linux/amd64 digest.
ARG CURL_BASE_IMAGE=curlimages/curl:8.21.0
FROM ${CURL_BASE_IMAGE}

# Keep the upstream entrypoint and unprivileged default user. The Hospital
# compose file explicitly selects root only for its read-only worker process.
USER root
RUN apk upgrade --no-cache
USER curl_user
