# LOSPOR Hospital architecture

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
- `caddy`: TLS termination and the only published network boundary.

All services run on one Docker host in the reference installation. PostgreSQL,
API internals, and workers have no published host ports.

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
still requires application authorization. Hospital IT should prefer VPN or an
identity-aware gateway for every administrative surface.

## Reference scope

This repository is a production-oriented single-node reference appliance. It
does not itself provide hypervisor clustering, a second PostgreSQL node,
off-site backup storage, endpoint management, or a hospital identity-provider
integration. Those are deployment responsibilities, not hidden assumptions.
