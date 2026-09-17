# ENGLISH BELOW

# LOSPOR Hospital — български

LOSPOR Hospital е публикуваната, самостоятелно хоствана клинична платформа на
LOSPOR за една лечебна институция. Тя е физически и оперативно отделена от
публичната Cloud Demo среда.

Инсталацията включва локална клинична база данни, уеб и PWA клиенти,
изследователски Database Browser, криптирана връзка към пациентската
идентичност, контролирано изпращане на OMOP пакети, резервни копия, независим
Status монитор и Docker-базиран Linux appliance. Суровите болнични
идентификатори остават локални и не се изпращат към LOSPOR Central.

За нова инсталация започнете с `docs/quick-start.md`, след това вижте
`docs/host-preparation.md`, `docs/installation.md`,
`docs/status-monitor.md` и `docs/security.md`. Изданията се проверяват,
подписват и публикуват по отделната процедура за Hospital.

---

# English

# LOSPOR Hospital

Released, independently hospital-hosted LOSPOR clinical platform.

This repository is physically and operationally separate from the public
serverless demonstration. It provides a local clinical database, web and PWA
clients, the local research Browser, encrypted patient linkage, policy-gated
OMOP delivery, backups, an independent appliance Status monitor, and a
Docker-based Linux appliance.

Start with:

- `docs/quick-start.md` — from an empty server to ready for clinical use
- `docs/host-preparation.md`
- `docs/architecture.md`
- `docs/installation.md`
- `docs/status-monitor.md`
- `docs/security.md`
- `docs/operations.md`
- `docs/secret-rotation.md`
- `docs/central-enrollment.md`

After installation, authorized appliance administrators can open Status at
`https://<clinical>/status/`. A loopback-only HTTPS listener is also available
through an SSH tunnel when the clinical gateway is unavailable. Status has its
own data volume and authentication verifier, so it remains usable during a
clinical API or PostgreSQL outage. It cannot survive loss of the host, Docker
daemon, power, or hospital network.

No production deployment or Central enrollment is automatic. The appliance
does not send logs or telemetry to Sentry or another external monitoring
service. Its Mobile/PWA includes version-matched local help and a deliberate,
privacy-safe diagnostic preview. Hospital IT may configure one internal HTTPS
or `mailto:` support destination later, in Status or `site.env`; no report is
sent automatically.
