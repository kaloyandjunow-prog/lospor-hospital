# LOSPOR Hospital

Independent hospital-hosted LOSPOR clinical platform.

This repository is physically and operationally separate from the public
serverless demonstration. It provides a local clinical database, web and PWA
clients, the local research Browser, encrypted patient linkage, policy-gated
OMOP delivery, backups, an independent appliance Status monitor, and a
Docker-based Linux appliance.

Start with:

- `docs/architecture.md`
- `docs/installation.md`
- `docs/status-monitor.md`
- `docs/security.md`
- `docs/central-enrollment.md`

After installation, authorized appliance administrators can open Status at
`https://<clinical>/status/`. A loopback-only HTTPS listener is also available
through an SSH tunnel when the clinical gateway is unavailable. Status has its
own data volume and authentication verifier, so it remains usable during a
clinical API or PostgreSQL outage. It cannot survive loss of the host, Docker
daemon, power, or hospital network.

No production deployment or Central enrollment is automatic. The appliance
does not send logs or telemetry to Sentry or another external monitoring
service.
