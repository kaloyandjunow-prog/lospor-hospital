# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim

WORKDIR /fixture
COPY --chown=node:node infra/status-fixture/server.mjs ./server.mjs
COPY --chown=root:root infra/status-fixture/install-dev-secrets.sh /usr/local/bin/install-dev-secrets.sh

RUN chmod 755 /usr/local/bin/install-dev-secrets.sh \
  && mkdir -p /signals \
  && chown node:node /signals \
  && chmod 755 /signals

USER node
ENV FIXTURE_HOST=0.0.0.0 \
    FIXTURE_PORT=8080 \
    HOSPITAL_SIGNALS_DIR=/signals
EXPOSE 8080

CMD ["node", "server.mjs"]
