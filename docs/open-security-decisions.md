# Open security decisions

[Български](open-security-decisions.bg.md) | **English**

Findings from an external review that were **verified against the code and
deliberately not changed**, because each is a policy choice rather than a
defect. They are recorded here so the choice is made once, on purpose, instead
of being rediscovered by the next review.

Everything else that review raised was fixed in 1.3.0 — see the changelog.

## 1. Does the research VPN bound the data, or only the Browser?

**What is true today.** The CIDR allow-list on the research hostname guards one
thing: the reverse proxy to the Browser. The clinical host serves all of
`/v1/*`, including `/v1/research/*`, with no network restriction — its own
comment says so plainly: "`/v1` belongs to the API on every host that serves
clients."

An authorised account with a research grant can therefore reach its permitted
research data from outside the research VPN, if the clinical hostname is
reachable. Account authentication and per-grant authorisation still apply, so
this is not anonymous access. It is a narrower boundary than the documentation
implies.

**The decision.** Either the VPN is meant to bound the research *interface*, in
which case the documentation should say that and this is correct as built — or
it is meant to bound the research *data*, in which case the restriction has to
be enforced on the research routes themselves and not only at the hostname.

**Decided 13 September 2026: the list bounds the research interface.** The
research network list restricts who can open the Research Browser website. It
does not bound research data. Sign-in and per-grant authorisation protect that
data on every address that serves the API. No code changed. The network and
security documents now say this and nothing stronger.

## 2. Should `/api/internal/*` be blocked at the gateway?

**What is true today.** Caddy answers `/v1/internal/*` with a 404. The web
application rewrites `/api/:path*` to the API's `/v1/:path*` with no exclusion
for `internal`, and Caddy's catch-all routes `/api/*` to the web app. So
`/api/internal/purge-deleted` reaches an endpoint that `/v1/internal/...` is
refused.

Every internal endpoint still requires `CRON_SECRET`, so this defeats the
network restriction, not the authentication.

**Decided and fixed 13 September 2026 (1.4.0).** Caddy now answers
`/api/internal/*` with the same 404 as `/v1/internal/*`, before the web app's
catch-all. On a running appliance, `/api/internal/purge-deleted` reached the API
before the change and got 404 after, and so did the variants: a capital
`Internal`, a percent-encoded `i`, a doubled slash, and a `..` segment. Ordinary
`/api/*` routes are unchanged. `caddy-boundaries.test.mjs` holds the matcher
ahead of the catch-all.

## 3. Should the API stop connecting as the database superuser?

**What is true today.** `POSTGRES_USER: lospor` is created by the official image
as a superuser, and both `DATABASE_URL` and `DIRECT_URL` use that account. There
is no demotion and no separate runtime role.

The appliance already knows the pattern: `create-status-probe.sh` builds
`lospor_status_probe` as a login role with a connection limit and
`default_transaction_read_only`. That discipline was applied to the Status probe
and not to the application.

**Fixed in 1.4.0.** The running API connects as `lospor_app`. That role has no
superuser, create-database, create-role or replication rights, and a connection
limit. It can read and write the application's rows but cannot change the
schema or write the migration history, and it cannot connect to the maintenance
databases. Migrations, backups, restores, terminology builds and the operator
tools still use `lospor`.

- **Grants.** `db-app-role-init` runs `create-app-role.sh` after migrations and
  before the API on every Compose start, so the grants stay true after an update
  adds tables, after a restore replaces the database, and after a terminology
  generation is swapped in. Restores use `pg_restore --no-privileges`.
- **Rotation.** The `database` rotation scope rotates both passwords.
- **Verified on a running appliance.** The API connects as `lospor_app`; DDL
  and writes to `_prisma_migrations` are refused; every application table is
  granted; doctor passes; a restore drill passes; and both a `database` and an
  `ordinary` rotation committed and verified.

## 4. How long should EHR staging data be kept, and who deletes it?

**What is true today.** Imports carry a 14-day `expiresAt`, but expiry is only
ever a read filter. Nothing deletes an expired `EhrImport` or its
`EhrImportField` rows, and nothing cleans up processed or rejected inbound files
on disk. Both can contain identifiers and clinical content.

**The decision.** The retention period is a hospital governance question, not a
technical default — fourteen days is not a legal requirement anywhere. Once a
period is chosen, the deletion needs implementing, and its failures need to
surface in Status the way the retention purge and the case-closure sweep do.
Silent non-deletion is the current state and is the thing to avoid repeating.

**Decided 13 September 2026: 14 days. Fixed in 1.4.0.** The daily retention
run deletes imports past their window, with their fields, and the files the
folder transport kept in `processed/` and `rejected/`. It never touches the inbox
or the outbox. A site can shorten the window in **Hospital controls**, from 1 to
14 days, and a database constraint holds the stored value in that range. A
failed deletion turns the Status retention reading to
`RETENTION_EHR_STAGING_REJECTED`.

## 5. Which AI models should the appliance use?

**What is true today.** The routes default to `open-mistral-7b` and
`pixtral-12b-2409`. Neither `MISTRAL_MODEL` nor `MISTRAL_VISION_MODEL` is
forwarded by Compose, and `HospitalExternalAiPolicy` — the sealed row Status
uses to configure external AI — has no model field either. So on an appliance
the model cannot be selected by any supported route; it is whatever the route
files hardcode.

Whether those particular models are deprecated has **not** been verified here
and needs checking against the provider's current catalogue.

**The decision.** Which models are clinically validated for lab and monitor
extraction, and then whether model selection belongs in the sealed policy row
alongside the credential — which is where every other external-AI setting lives.
