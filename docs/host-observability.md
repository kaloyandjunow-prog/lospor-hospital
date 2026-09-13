[Български](host-observability.bg.md)

# Privacy-safe host observability

The Status container cannot safely infer host storage, host time
synchronization, Docker state, or the configured update supply route. It
also must not receive general host access merely to display those facts. A
root-side one-shot probe therefore reduces the host view to one exact,
non-secret snapshot:

```text
/opt/lospor-hospital/.data/runtime/update/state/host-observability.v2.json
```

`lospor-host-observability.timer` refreshes the file every minute. Status mounts
the containing state directory read-only. The monitor has no route through
Status and Status has no Docker socket, root filesystem mount, shell, or log
viewer.

## What crosses the boundary

The v2 file contains only its schema/signal identity, UTC observation time, and
fixed enums for:

- aggregate appliance/Docker/backup filesystem capacity;
- network clock synchronization;
- root-protected verified local-backup freshness;
- encrypted off-host-copy acknowledgement;
- host update-agent service/heartbeat health;
- HTTPS certificate expiry;
- the expected long-running Compose services;
- unfinished or unsafe restore-journal evidence;
- the release-activation recovery lock; and
- the connected/offline update supply route.

The parser rejects the entire signal if any key is added, any enum is unknown,
or the timestamp is invalid/future. It cannot accept a patient or case identifier, user/account
identifier, hostname, domain, IP address, filesystem path, certificate body,
credential value, raw command output, log line, or arbitrary text. The probe
also prints only fixed result codes to its own service output.

Status treats an absent/invalid signal and a signal older than three minutes as
**Unknown**, never green. This allows two missed one-minute runs plus scheduling
slack without hiding a stopped timer.

## Thresholds and meanings

- Storage is `low` below 20 GiB available or at 85% use, and `critical` below
  10 GiB or at 95% use on any monitored filesystem. Only the worst enum is
  published; paths and byte counts remain on the host.
- Verified local backup is fresh for six hours, aging until eight hours, and
  overdue thereafter. The four-hour backup interval therefore has a two-hour
  execution/retry grace period without weakening the eight-hour failure alarm.
- An off-host acknowledgement for the newest verified object is current for
  six hours, aging until 24 hours, then overdue. An acknowledgement for an
  older object is `pending`. The shipped deferred hook is explicitly
  `not-configured`, not a successful copy.
- An installed update agent must be active and have a heartbeat no older than
  ten minutes. Deliberate console-only mode is shown as not configured, not as
  a failure.
- A certificate expiring within 30 days is degraded; an expired or missing
  certificate is unavailable. Operator mode checks the one hospital-supplied
  certificate that readiness already proved covers both public names.
  ACME/local modes make separate loopback SNI checks for the clinical and
  research names. Caddy's local test CA deliberately uses short-lived,
  automatically renewed leaves, so local mode checks actual expiry without
  applying the public/operator 30-day warning window. Every mode also checks
  the independent Status fallback certificate. Only the worst state is
  published; no name, path, subject,
  fingerprint, or certificate body crosses into Status.
- Every expected persistent service must be running and, when it has a Docker
  health state, healthy. One-shot migration/initializer containers are not
  expected to remain running.
- Restore and activation evidence crosses the boundary only as `clear`,
  `present`, or `invalid`. Journal names, phases, database names, backup
  identities, process details, and timestamps remain on the host. A completed
  in-place restore is clear only when its exact durable destructive-boundary
  marker is structurally safe; an orphaned, altered, or unsafe marker is
  invalid rather than silently green.

## Hospital monitoring check

Hospital-owned monitoring can consume the same projection without access to
Status, Docker, secrets, or host logs:

```sh
python3 /opt/lospor-hospital/current/scripts/check-host-observability.py
```

The command is a Nagios-compatible local check: exit `0` is **OK**, `1` is
**WARNING**, `2` is **CRITICAL**, and `3` is **UNKNOWN**. Output contains only
the fixed `LOSPOR HOST` state and allowlisted result codes. It never prints a
path, hostname, address, identifier, credential, journal line, or arbitrary
input. Missing, oversized, linked, non-root-writable, duplicate-key, malformed,
future, and more-than-three-minute-stale projections all fail closed as
`UNKNOWN`. Hospital IT may wrap this command from Nagios/Icinga or another
on-host executor; no outbound telemetry is added.

## Installation and repair

The normal appliance installer installs and starts the monitor after recording
the update-agent mode. To reinstall the canonical unit and immediately require
a fresh signal:

```sh
sudo sh /opt/lospor-hospital/current/scripts/install-host-observability.sh
```

The installer verifies all four service/timer units with `systemd-analyze`,
enables both timers, runs the certificate check and probe once, and fails
unless the exact signal is fresh. The services use `ProtectSystem=strict`,
write only to their narrow state/secret directories, and follow the `current`
release symlink so an activated release updates both checks.

Fresh installation and every appliance update validate the Status fallback
key/certificate pair, both required loopback SANs, and at least 30 days of
remaining validity. A valid pair is retained unchanged. An expiring, malformed,
or mismatched pair is replaced only after a complete 825-day replacement has
passed all checks. A persistent timer repeats that validation twice daily so a
running appliance cannot outlive its original certificate. Replacement writes
a durable reload marker, restarts only Status, verifies the certificate served
by the loopback listener has the expected SHA-256 fingerprint, and clears the
marker only after that proof succeeds. A failed restart or fingerprint mismatch
keeps the marker for the next run and remains visible through the host signal.
The check shares the persistent backup/update maintenance lock, so it defers
rather than restarting Status during a backup, database migration, release
activation, or other destructive host operation.

The same validation also runs during installation, updates, and before
appliance-operator maintenance. Because the certificate is self-signed,
Hospital IT may need to trust the replacement again if it had chosen to
suppress the normal browser warning.

Host-only diagnosis may use:

```sh
systemctl status lospor-host-observability.timer
systemctl status lospor-host-observability.service
systemctl status lospor-status-fallback-certificate.timer
systemctl status lospor-status-fallback-certificate.service
sudo sh /opt/lospor-hospital/current/scripts/host-observability-probe.sh
```

Service logs stay on the host. Do not copy raw logs into Status or a diagnostic
bundle without a separate privacy review.

## Connected and offline update supply

`HOSPITAL_UPDATE_SUPPLY_MODE=connected` is the default. Releases are downloaded
from the public GitHub release and images are pulled anonymously from ghcr.io;
the appliance holds no GitHub or registry credential, and trust comes only from
the release signature. The host needs outbound HTTPS to `api.github.com`, the
GitHub release-asset storage it redirects to, and `ghcr.io`. Anonymous GitHub
API use is limited per network address; when that allowance is spent,
preparation says when to retry.

`HOSPITAL_UPDATE_SUPPLY_MODE=offline` takes every release from verified USB media
and needs no outbound access. The verified `load-offline.sh` route selects this
mode for a new offline installation. Status shows either route as a valid
choice and an unknown mode as an outage.
