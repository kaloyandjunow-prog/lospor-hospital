# Hospital audit evidence (HAUD-01)

[Български](audit-evidence.bg.md) | **English**

This document describes the Hospital audit boundary. It is an evidence
trail, not routine observability: a privileged lifecycle decision must not
commit if its audit row cannot commit in the same PostgreSQL transaction.

## Durable transition inventory

| Transition family | Durable actions | Transaction owner |
|---|---|---|
| Hospital account issue and use | `HOSPITAL_ACCOUNT_CREATED`, activation/recovery issue, reissue, activation, and recovery consumption | `hospital/account-provisioning.ts` |
| Appliance bootstrap/operator | initial institution/admin creation; operator initialize, rotate, transfer, reconcile | guarded bootstrap/operator transaction |
| Existing administrator account creation/approval | `HOSPITAL_USER_CREATE`, `USER_APPROVE` | administrator routes |
| Authority and HOD decisions | `ADMIN_ACCOUNT_AUTHORITY_CHANGE`, `ROLE_REQUEST_SUBMIT`, `HOD_ROLE_REQUEST_APPROVE`, `HOD_ROLE_REQUEST_REJECT` | role/request routes |
| Institution membership decisions | request, self-leave, approve, reject | user/administrator institution routes |
| Account/legal lifecycle already present in Hospital | deletion request/admin deletion, retention anonymisation, password recovery, email verification, terms acceptance | owning lifecycle route/service |
| Clinical-rules workbench | create, rule save/delete, pediatric profile replacement, publish, select, clear selection | `clinical-rules/service.ts` |
| Hospital guidance/external AI | policy and credential replace/remove codes | Hospital control plane |
| Central | transport configuration, automatic-delivery policy, batch retry, per-case withdraw/resend action | Hospital enrollment/control plane/case route |
| Research | saved cohort create/update/delete, export creation, generic grants, Hospital grant issue/supersede/revoke, and one OMOP approval | cohort/grant route, export transaction, or Hospital research control |

Account creation plus activation-link issuance deliberately produces two rows:
these are two distinct transitions, and each transition produces exactly one
row. A no-op direct role update, ruleset deletion, or selection clear produces
no transition row.

Routine high-volume case/event edit and view telemetry remains best effort.
Case finalization, unfinalization, transfer, patient-link correction, research
grants, and other authority-bearing operations remain durable.

## Stable action/display contract

`apps/api/src/lib/audit-actions.ts` is the append-only source of codes,
categories, and exact Bulgarian/English labels. A code may not be renamed or
reused. `GET /v1/admin/audit-logs` rejects unknown exact filters and returns
the same catalog with each schema-version-1 page. Web and PWA parse that runtime
catalog; they do not contain a duplicate action registry.

The administrator response reconstructs safe rows. Raw database `detail`,
internal target IDs, and internal actor IDs remain server-side because historic
rows predate the privacy guard. Actor display names remain because identifying
who performed a privileged act is necessary audit evidence. Unknown historic
codes receive a localized generic label rather than raw server prose.

## Audit detail privacy

The single writer rejects nested fields that can contain:

- passwords, secrets, credentials, private keys, links, URLs, or tokens;
- patient numbers, case codes, masked patient numbers, or clinical payloads;
- direct account PII such as email, phone, address, or names;
- free-text reasons, notes, purposes, descriptions, messages, or errors.

Allowed evidence is bounded: opaque database IDs, roles, action/reason/error
codes, policy booleans, counts, timestamps, hashes, versions, and explicit
changed-field names. A human reason can remain in its governed domain record;
the audit row records only `reasonRecorded: true`.

## Verification gates

`apps/api/src/lib/hospital/audit-governance-inventory.ts` is the executable
Hospital overlay matrix. Its test requires an exact disposition for every
HAUD-01 family, registered action codes in the named transaction owner, and a
rollback-evidence marker. It also pins the provenance and actor-principal
blocks below so a future release cannot silently claim them as complete.

The focused suite checks registry uniqueness and bilingual completeness,
unknown-filter rejection, server response privacy, nested forbidden keys,
client fail-closed parsing, client non-rendering of detail/target fields,
clinical-rules audit-failure propagation, and source drift for lifecycle
transactions. The existing PostgreSQL audit atomicity test remains the database
rollback proof when the integration database gate is enabled.

## Provenance boundaries still staged

Hospital's API is pinned in `UPSTREAM_VERSIONS.json` to public API 9.3.0 commit
`a1e866f56c3040bc9332cc03d33a37108eff3d5f`. The current owner API work contains
generic lifecycle structures that this pinned Hospital import does not have:

- `AuthSession` plus account suspension/reactivation/restore session revocation;
- `LegalAcceptance` and separate versioned terms/privacy descriptors;
- `User.suspendedAt`, `User.recoveryRequiredAt`, and `User.anonymizedAt`;
- `ClinicalRulesetPublicationEvidence` and its confirmation workflow.
- transactional generic email-verification/password-reset token reissue actions.

This pass makes every corresponding mutation that already exists in Hospital
durably audited, including the seven existing clinical-rules transitions. It
does **not** manually copy those missing generic owner schemas/routes into the
vendored tree. Their safe route remains the normal public upstream release,
then a provenance-recorded Hospital vendor import and overlay reconciliation.
Until that import, Hospital cannot claim the missing generic suspend/session,
separate legal-acceptance, or publication-confirmation workflows.

## Actor-principal decision still required

Six existing operator scripts mutate governed records but cannot truthfully
name the person responsible: the five create/append/prune clinical-rules scripts
listed in the executable inventory, plus `scripts/seed-play-reviewer.ts`.
Auditing the affected account as the actor would be false. The decision is
between requiring the operator to select an existing administrator for each run
or creating a narrowly scoped non-human system operator. Until that choice is
made, these scripts remain explicitly decision-blocked rather than being given
invented audit identity.
