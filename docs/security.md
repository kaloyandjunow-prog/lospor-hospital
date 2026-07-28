# Security model

## Required controls

- full-disk encryption on the host and every backup destination;
- TLS for all user and Central traffic;
- mutual TLS plus manifest signatures for Hospital-to-Central delivery;
- VPN or identity-aware access for research and administration;
- least-privilege local accounts and protected administrator credentials;
- host firewall, automatic security patching, malware/EDR policy, NTP, and
  centralized monitoring;
- offline escrow for patient, pseudonym, signing, and database recovery keys.

The contents of `secrets/`, `.env`, `backups/`, PostgreSQL volumes, and runtime
export volumes are sensitive. They are excluded from Git but still require
filesystem permissions and encrypted media.

## Data minimization

The clinical model rejects likely direct identifiers. Patient linkage is a
separate encrypted local concern. Central receives only the approved
pseudonymized OMOP projection and technical provenance required to verify it.

## Certificate lifecycle

Hospital signing and mTLS keys are installation-specific. Rotate them after
suspected compromise and on the institutional schedule. Central must revoke a
site before accepting a replacement identity. The temporary self-signed client
certificate created by setup is not valid for production enrollment.

## Incident rule

If key compromise, unauthorized export, database exposure, or unexplained
revision mismatch is suspected:

1. stop Central delivery without deleting the queue;
2. preserve logs, receipts, and host evidence;
3. revoke the site at Central;
4. notify the hospital security/data-protection process;
5. restore service only with reviewed replacement credentials.

## Reverse proxies

The reference Caddy service is the public edge and does not trust forwarded
client-IP headers. If Hospital IT places another proxy or CDN in front, it must
configure only that proxy's exact address ranges and revalidate every VPN/LAN
allowlist. Until then, restricted surfaces fail closed behind an upstream proxy.
