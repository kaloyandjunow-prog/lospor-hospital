# Network and TLS boundaries

[Български](network-boundaries.bg.md) | **English**

The appliance has two authoritative DNS names:

- `HOSPITAL_CLINICAL_DOMAIN` serves Web, the phone/PWA application, API, and
  Status at `/status/`;
- `HOSPITAL_RESEARCH_DOMAIN` serves only Research Browser.

They must be different and both must resolve to the appliance. Research and
Status have independent network allowlists. A request outside an allowlist is
expected to receive HTTP 403; that is a healthy boundary, not an outage.

## Exact CIDR allowlists

`HOSPITAL_RESEARCH_ALLOWED_CIDRS` is the Research/VPN boundary.
`HOSPITAL_STATUS_ALLOWED_CIDRS` is the narrower IT-management boundary. The
guided installer has no permissive default for either. It accepts IPv4 and IPv6
CIDRs separated by spaces or commas, converts host addresses to their canonical
network, removes duplicates, and refuses:

- an empty or malformed value;
- `0.0.0.0/0` and `::/0`;
- the old placeholder containing all three RFC1918 ranges.

The values in `.env.example` are documentation-only networks and match no real
hospital client. Replace them during installation.

Change an installed boundary through the rollback-safe workflow:

```sh
sudo sh /opt/lospor-hospital/current/scripts/configure-network-boundaries.sh \
  --research '10.24.30.0/24 fd12:3456:789a:30::/64' \
  --status '10.24.40.0/24 fd12:3456:789a:40::/64'
```

The command canonicalizes both values, resolves Compose, parses the exact
mode-expanded Caddy configuration, protects the previous values, and restores
the previous `site.env` and `.env` if the edge cannot restart. Run readiness afterwards:

```sh
sudo sh /opt/lospor-hospital/current/scripts/readiness-check.sh --strict
```

An exceptional site that has formally documented all three RFC1918 ranges as
one boundary must provide both explicit flags. This never permits a world-wide
range:

```sh
sudo sh /opt/lospor-hospital/current/scripts/configure-network-boundaries.sh \
  --research '10.0.0.0/8 172.16.0.0/12 192.168.0.0/16' \
  --status '10.24.40.0/24' \
  --unsafe-all-rfc1918 --confirm-all-rfc1918
```

## TLS modes

`HOSPITAL_TLS_MODE` is the only TLS selector:

| Mode | Certificate | Host port 80 |
| --- | --- | --- |
| `operator` | `secrets/tls/fullchain.pem` and `secrets/tls/private.key`, issued by hospital IT | not published |
| `acme` | public ACME authority | published by the fixed `tls-acme` profile |
| `local` | Caddy local authority, bench use only | not published |

`COMPOSE_PROFILES` is derived, not independently chosen: it is exactly
`tls-acme` for ACME and empty for the other modes. Free-form
`HOSPITAL_CADDY_GLOBAL_EXTRA` and `HOSPITAL_CADDY_SITE_EXTRA` values are
forbidden because injected Caddy directives could precede an allowlist.

For operator TLS, set `HOSPITAL_TLS_VERIFY_CA` to the trusted hospital CA. The
strict readiness gate checks the key's file mode, key/certificate match, both
DNS identities, server EKU, current validity, complete chain and CA, and at
least 30 days remaining. Install and update also parse the Caddyfile before any
new listener starts:

```sh
sudo sh /opt/lospor-hospital/current/scripts/validate-caddy-config.sh
sudo sh /opt/lospor-hospital/current/scripts/readiness-check.sh --strict
```

Changing TLS mode is an IT maintenance action. Update `HOSPITAL_TLS_MODE`, its
derived `COMPOSE_PROFILES`, the CA path/files if applicable, then run both gates
above before recreating `caddy` (and `acme-http` only for ACME). Do not start a
partially changed pair: readiness deliberately treats that as a failure.

An appliance upgrading from 1.1.x has no authoritative mode/profile fields.
The 1.2.1 update deliberately refuses to infer the hospital certificate route
or preserve a broad Status default. IT must first choose the real TLS mode,
set its paired profile, and enter both exact CIDR boundaries. This is a
one-time, fail-closed upgrade decision; it is never silently converted to ACME.

`scripts/doctor.sh` then checks Web, PWA, API, Status, Research Browser and the
live certificate for **both** names on the configured HTTPS port. It never uses
`--insecure` for the clinical/research edge.
