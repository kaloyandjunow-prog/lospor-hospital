# LOSPOR Hospital API

[Български](README.bg.md) | **English**

The Hospital API owns the local operational database, authentication,
authorization, clinical writes, audit records, local research access, and
policy-controlled delivery to LOSPOR Central.

It is not the public serverless API. Production configuration comes from the
repository root `compose.yaml` and `.env`; `.env.example` here is only for local
API development.

Use the root installation and release documentation. Do not deploy this
directory independently.

Hospital 1.2.0 adds a private, bearer-authenticated account lifecycle overlay
for Status. It creates only clinical Member/HOD or research-only accounts and
issues digest-only, mail-independent activation/recovery links. The private
routes are not published by Caddy. See
[account provisioning](../../docs/account-provisioning.md) before changing the
schema or importing the staged shared 1.2.0 identity migration.

The same private Status bearer now reaches the Hospital-only control-plane
namespace. It can issue/revoke/supersede immutable granular research grants,
approve one exact frozen OMOP dataset, configure push-only Central transport,
separately approve clinical export, retry terminal Central batches, and change
adult/pediatric prospective-guidance policy. It also controls the independent
Hospital external-AI policy and replaces/removes a Mistral credential that the
API stores only as AES-256-GCM authenticated ciphertext under an API-only seal
key. The bearer identifies only the
private Status service; the designated appliance operator is resolved inside
PostgreSQL and each mutation/audit pair commits atomically. It does not create
a clinical or research session.

The Hospital overlay also owns one read-only clinical-baseline readiness
assessment shared by both runtime routes, Hospital capabilities, the private
Status control plane, and the installer report. Policy is reported separately.
Readiness requires the exact selected/published adult or pediatric v2 platform
preset identity, version, validated rule keys, exact rule/profile counts, and a
persistence-normalized content/source-reference SHA-256. The safe projection
contains no rule payload, source list, preset name, free text, or actor identity.
It never publishes, selects, or repairs content.

Hospital Web may additionally use the clinical-session per-case Central route.
Once the separate global locks are enabled, every eligible finalized case is
queued automatically. The route is limited to the Member who finalized the case,
the HOD's institution scope, or a clinical Admin and returns only a fixed
delivery state and safe latest outcome. It can withdraw an accepted case or
queue a withdrawn case for a fresh UPSERT. Each mutation shares the Central
reservation lock and commits the action with its audit row; it cannot configure
transport or enable the global policy. Mobile and PWA expose no Central action.
The paginated `GET /v1/hospital/central-cases` discovery route returns only an
internal route key, finalization time, and this bounded state, so a finalizing
clinician can find a case without regaining clinical-record access. A Member is
scoped by the finalization that still stands, the one nothing supersedes, so a
correction moves the authority and a finalization that recorded no author gives
it to nobody. A clinician who created a case and handed it on holds no Central
authority over it.

Browser grant mutation and the former clinical-ADMIN Central enrollment,
export-policy mutation, and delivery-trigger routes are absent on Hospital.
Private control routes return `404` outside Hospital.
See [research control](../../docs/research-control.md),
[Central Status control](../../docs/central-status-control.md), and
[guidance policy](../../docs/clinical-guidance-policy.md). External AI setup,
safe states, credential custody, and the pre-egress route gate are documented
in [external AI control](../../docs/external-ai-control.md).

The public capabilities response may also expose the optional non-secret
`HOSPITAL_SUPPORT_URL` as HTTPS help/ticketing or one bare `mailto:` mailbox.
The Hospital API repeats the installer validation and fails closed for unsafe
or malformed values. It neither receives nor transmits the Mobile/PWA
diagnostic preview.

## Clinical role supervision

Clinical role changes are available only to the private Status account-control
bearer at `PATCH /v1/internal/hospital/accounts/:id/role`. The strict request is
`{ "role": "MEMBER" | "HEAD_OF_DEPT" | "ADMIN", "reason": string }`; the
reason is required (10–1000 characters) but only `reasonRecorded` enters audit
detail. Create and activate a Member/HOD account before promoting it to Admin;
there is no chosen-password or direct-Admin provisioning route.

The transaction refuses research-only or legacy authority, a HOD in an
ineligible institution, demotion of the designated appliance operator, and
demotion of the last active clinical Admin. Role changes revoke sessions and
outstanding account/password-reset links. HOD demotion changes future scope
only: it never reassigns or deletes that clinician's cases. The former
clinical-session `PATCH /v1/admin/users/:id` role mutation returns `404`.

## Clinical role supervision

Clinical role changes are available only to the private Status account-control
bearer at `PATCH /v1/internal/hospital/accounts/:id/role`. The strict request is
`{ "role": "MEMBER" | "HEAD_OF_DEPT" | "ADMIN", "reason": string }`; the
reason is required (10–1000 characters) but only `reasonRecorded` enters audit
detail. Create and activate a Member/HOD account before promoting it to Admin;
there is no chosen-password or direct-Admin provisioning route.

The transaction refuses research-only or legacy authority, a HOD in an
ineligible institution, demotion of the designated appliance operator, and
demotion of the last active clinical Admin. Role changes revoke sessions and
outstanding account/password-reset links. HOD demotion changes future scope
only: it never reassigns or deletes that clinician's cases. The former
clinical-session `PATCH /v1/admin/users/:id` role mutation returns `404`.

## Durable audit evidence

Hospital audit action codes and their Bulgarian/English labels have one
append-only source in `src/lib/audit-actions.ts`. Privilege, account, legal,
role, institution, clinical-rules, Central, external-AI, guidance, and research
control changes write their evidence in the same PostgreSQL transaction. The
writer rejects secret, patient-number, case-code, raw-clinical-payload, direct-
PII, and free-text detail fields. Routine high-volume case/event telemetry
remains deliberately best effort. See
[audit evidence](../../docs/audit-evidence.md) for the transition inventory,
privacy contract, tests, and the owner-import boundaries that remain staged.
