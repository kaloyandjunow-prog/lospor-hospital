# Hospital research access control

[Български](research-control.bg.md) | **English**

Hospital 1.2.1 separates operational authority from research-data authority.
The appliance operator manages grants from `/status/control` after signing in
with the independent Status password, but Status never receives a clinical JWT,
case row, cohort result, or export artifact.

## Who may receive a grant

An active (email-verified, non-deleted) clinical Member, Head of Department, or
Administrator may receive an explicit grant. A `RESEARCH_ONLY` account also
requires one. The latter remains excluded from clinical application routes.

An Administrator retains the existing global aggregate, small-cell-suppressed
view. It does not imply case inspection, CSV/JSON export, OMOP export, sharing,
or grant-management access in Browser. HOD and Member roles imply no research
access. Explicit grants are evaluated for all four account types, including an
Administrator; their detailed/export scopes remain exactly the granted scopes.

## Immutable granular grants

Every grant states one research purpose, exactly one institution or all
institutions, a validity period, and separate permission bits:

- aggregate query;
- pseudonymous case inspection;
- CSV export;
- JSON export;
- OMOP export; and
- institution-cohort sharing.

The default validity is 90 days and the maximum is 365 days. OMOP also requires
the matching CSV or JSON bit. Sharing also requires query permission. Database
constraints enforce scope and permission combinations. Permission, purpose,
scope, subject, grantor, and expiry are immutable after issuance.

Changing a grant means issuing a replacement from Status and selecting the old
grant as its predecessor. The old row becomes terminal and records the new
grant ID. Revocation is also terminal and requires a reason. Grant mutation and
its audit row commit in one PostgreSQL transaction.

## Exact OMOP approval

Creating an OMOP export first freezes its cohort definition, institution scope,
snapshot revisions, case count, purpose, format, and the one active grant that
covers the complete scope. A multi-institution export therefore needs one
all-institutions grant; narrow grants are never silently combined.

The worker does not claim that OMOP request until Status approves the exact
pending dataset. Approval copies and binds:

- export ID;
- requester ID;
- grant ID;
- purpose and OMOP CSV/JSON format;
- definition SHA-256;
- snapshot SHA-256; and
- snapshot case count.

PostgreSQL validates this tuple, the active format-specific grant, and its
scope at approval time. The approval is append-only. The worker and download
path revalidate the bound grant and exact approval; revocation, supersession,
or expiry blocks further processing/access even if another grant covers a
similar scope.

## Boundaries and verification

The Browser `/v1/research/grants` management routes return `404` in Hospital;
Status is the only appliance grant-management UI. Conversely, every private
`/v1/internal/hospital/control-plane` route returns `404` outside Hospital, so
the online serverless demonstration cannot expose these controls. The private
bearer is mounted only into API and Status and grants no general API authority.

Migration, route, access-scope, Status reauthentication, privacy-response, and
optional PostgreSQL trigger tests cover the boundary. See the Bulgarian version
at [research-control.bg.md](research-control.bg.md).

The complete Web Playwright release suite now proves the live authorization
transition for an HOD: denial without a grant, issuance of institution-scoped
aggregate-only access through the private Status control route, successful
aggregate query with case inspection still denied, revocation with a reason,
and immediate denial on the next request. Its designated test appliance
operator and bearer exist only in the disposable E2E database/configuration.
