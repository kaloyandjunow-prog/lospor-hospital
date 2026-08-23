# LOSPOR Hospital Web

[Български](README.bg.md) | **English**

The desktop clinical client for the independent Hospital appliance. It talks
to the local Hospital API through the internal container network and contains
no default analytics.

Use the repository root Compose file for production. The source was imported
from a pinned public web release; its historical changelog is retained for
traceability, not as Hospital deployment guidance.

## Central delivery for a case

Once Hospital IT enables the separate transport and clinical-delivery locks,
every eligible finalized case is queued automatically. On the case detail,
the immutable creating Member, the HOD for the case institution, and a clinical
Admin can read the bounded delivery state, withdraw an accepted case, and send
a withdrawn case again. There is no initial per-case approval or exclusion.
The paginated `/central-delivery` page keeps a transferred case discoverable to
its immutable creator while exposing only its internal route key, finalization
time, and bounded delivery state; it does not restore clinical-record access.
The controls exist only in Hospital Web, not Mobile or PWA. The panel calls the
same-origin Hospital proxy for `GET`/`PUT
/v1/hospital/cases/:id/export-control`; the API independently rechecks creator,
institution, or administrator scope.

The browser accepts only schema version 2 and an exact allowlist of delivery
fields. Unexpected fields make the panel unavailable and remove all controls.
It never renders patient identifiers, case pseudonyms, raw batch identifiers,
free-text audit detail, reason codes, or raw delivery error codes. Withdrawal
and resend each require a separate confirmation and never delete the Hospital
record.

## Administrator audit view

The view accepts only schema version 1 of the Hospital audit response. It uses
the API-owned action catalog for every Bulgarian/English label and filter, so a
new persisted action cannot silently disappear from a client-only list. Raw
audit detail, internal target identifiers, and raw server failures are not
rendered; a malformed catalog makes the view unavailable.
