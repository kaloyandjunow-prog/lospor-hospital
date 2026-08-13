# Hospital status fixture

This is a single development-only container that simulates the Hospital
appliance for the two-container Status test harness. It has no dependencies and
does not contain clinical data.

## Interface

The fixture listens on `FIXTURE_HOST:FIXTURE_PORT` (`0.0.0.0:8080` by default).
The harness must publish the port on host loopback only, for example
`127.0.0.1:18080:8080`. Status and the fixture share a writable signals volume.

Health routes:

- `GET /api/health/live`
- `GET /api/health/ready`
- `GET /database/health`
- `GET /web/health`
- `GET /pwa/health`
- `GET /browser/health`
- `GET /caddy/health`

`GET /internal/appliance-status` requires a bearer token read from
`FIXTURE_SNAPSHOT_TOKEN_FILE`.

Control routes require the bearer token read from
`FIXTURE_CONTROL_TOKEN_FILE`:

- `GET /__control/state`
- `POST /__control/scenarios/<scenario>`

Accepted scenarios are `healthy`, `recovery`, `api-down`, `api-not-ready`,
`database-down`, `web-down`, `pwa-down`, `browser-down`, `caddy-down`,
`backup-failure`, `worker-stale`, `worker-failure`, `low-storage`,
`central-standalone`, `mail-unconfigured`, and `migration-pending`. Arbitrary
state and free text are rejected.

## Signal contract

The fixture writes `backup-status.v1.json` and
`delivery-worker-status.v1.json` atomically under `HOSPITAL_SIGNALS_DIR`.
Both use `schemaVersion: 1`, a fixed `signalType`, an ISO-8601 `observedAt`,
and allowlisted `state` and `resultCode` values. A successful backup contains
only its numeric `artifactBytes` and `sha256` algorithm. A worker failure can
contain a one-digit HTTP status category. Neither contract permits paths,
identifiers, command output, or free text.

Run the dependency-free contract tests with:

```sh
node --test infra/status-fixture/server.test.mjs
```
