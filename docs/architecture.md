# LOSPOR Hospital architecture

[Български](architecture.bg.md) | **English**

## Product boundary

LOSPOR Hospital is an independent product. It imports reviewed snapshots of
the public clinical applications, but Hospital-only code, deployment files,
patient identity handling, and Central delivery logic live only in this
repository.

The public serverless demonstration is not an upstream database and is not a
fallback runtime. A Hospital installation remains clinically usable when the
Central datacenter or internet connection is unavailable.

## Runtime services

- `postgres`: canonical local operational database.
- `api`: authentication, authorization, clinical writes, audit, research, and
  export policy.
- `web`: desktop clinical application.
- `pwa`: installable browser client with offline clinical drafts.
- `browser`: local research and audit workspace.
- `delivery-worker`: retries approved OMOP deliveries to Central.
- `backup`: creates daily checksummed database dumps.
- `status`: authenticated operational monitoring with its own SQLite data
  volume and loopback-only HTTPS fallback.
- `caddy`: TLS termination and the only published network boundary.

All services run on one Ubuntu Server 24.04 LTS amd64 Docker host in the
reference installation. On Windows Server that Ubuntu host is a Hyper-V virtual
machine; it is not a Windows-container deployment. PostgreSQL, API internals,
and workers have no published host ports.

## Status monitor boundary

Status is a separate production container, not a page served by the clinical
API. It has no startup dependency on the API, PostgreSQL, Web, PWA, Browser,
worker, backup service, or Caddy. Its own SQLite volume stores only the
appliance-operator identity and authentication verifier, server-side sessions,
validated operational events, availability observations, and incident history.

Status obtains operational state through narrow interfaces:

- direct liveness/readiness probes for the clinical services;
- `SELECT 1` through a dedicated, read-only PostgreSQL role with no table
  privileges;
- a strictly validated aggregate appliance snapshot from the API;
- fixed-schema backup and delivery-worker markers from a read-only signal
  volume;
- strict read-only host-agent projections for release and terminology state,
  paired with one writable fixed-intent inbox whose root consumers reject
  paths, commands, unknown fields, replay, and unsafe inodes; and
- allowlisted operational event codes sent over the internal monitoring
  network.

The terminology intent carries only a fixed action and one direct package label;
the host resolves and verifies the approved package and serializes the mutation
with backup/update. Status cannot inspect licensed source files or host logs.

The Status container has no Docker socket, patient-data volume, API/Central
key directory, or general-purpose database credential. The clinical API sees
only its own `secrets/api/` directory and the two individual Status tokens it
needs to publish the aggregate snapshot and safe events.

The usual path is browser to Caddy to `/status/`. Caddy restricts that path to
`HOSPITAL_STATUS_ALLOWED_CIDRS`, and Status then requires its own login. The
same Status container also terminates private TLS on host loopback port `3443`.
Hospital IT can reach that listener through an SSH tunnel if Caddy is down.

This isolation protects against a clinical application or database outage. It
does not make a second appliance: Status will also be unavailable if the host,
Docker daemon, Status container or volume, power, or hospital network fails.
See [Status monitor](status-monitor.md) for access, credential, recovery, and
test procedures.

## Patient identity

The raw hospital patient number is normalized and stored only in the local
`PatientLink` table:

- lookup uses an institution-scoped HMAC;
- recovery uses AES-256-GCM encrypted ciphertext;
- routine screens receive only a masked value;
- clinical JSON, audit details, logs, and Central exports never receive it.

A separate keyed pseudonym is used for Central. The same patient at one
institution maps consistently across procedures. Different institutions
produce unrelated pseudonyms.

The encryption, lookup, and export keys are intentionally different. Losing
the encryption key makes raw local identifiers unrecoverable. Losing the
pseudonym key breaks future longitudinal linkage. Both require protected
offline escrow.

## Central delivery

Only locally approved, complete cases are eligible. The Hospital creates a
frozen revision set, maps it to eight OMOP 5.4 CSV tables, signs the manifest,
encrypts the archive with AES-256-GCM, wraps the key to Central's RSA public
key, and uploads with mutual TLS.

Central returns a signed receipt. A local checkpoint advances only after that
receipt is verified. Failed delivery never blocks local charting and is retried
with a lease and backoff. Withdrawal is another signed, receipted delivery.

Central cannot query the Hospital database, pull cases, or write back into a
case.

## Network boundary

The clinical web, PWA, and API may be internet-facing behind hospital firewall
policy. The research Browser is restricted to configured VPN/LAN ranges and
still requires application authorization. Status is restricted to
`HOSPITAL_STATUS_ALLOWED_CIDRS` and its independent appliance-administrator
login. Hospital IT should prefer VPN or an identity-aware gateway for every
administrative surface.

## Reference scope

This repository is a production-oriented single-node reference appliance. It
does not itself provide a prebuilt VHDX, hypervisor clustering, a second
PostgreSQL node,
off-site backup storage, endpoint management, or a hospital identity-provider
integration. Those are deployment responsibilities, not hidden assumptions.
