# Central enrollment

[Български](central-enrollment.bg.md) | **English**

Enrollment is an explicit operation shared by the Hospital and Central
operators.

1. Hospital setup creates `secrets/api/site-client.csr`.
2. Central signs that CSR with its site-client CA:

   ```sh
   scripts/sign-site-csr.sh SITE_CODE hospital.csr hospital-cert.pem
   ```

3. Transfer `hospital-cert.pem` and Central's `site-client-ca.pem` through an
   approved secure channel. Install them as:
   - `secrets/api/site-client-cert.pem`
   - `secrets/api/central-ca.pem`
4. Central creates a one-use, 24-hour enrollment token:

   ```sh
   scripts/create-enrollment-token.sh "Hospital name"
   ```

5. Hospital IT signs in to the independent Status page and opens
   `/status/control`. Under **Central transport**, enter the HTTPS endpoint,
   site code/name, institution, one-use token, reason, and current appliance
   administrator password. This creates the separately audited transport lock.
6. In the separate **Central clinical export approval** form, decide whether
   clinical export is enabled. Confirm the current password again. Transport
   enrollment does not imply this approval.
7. Confirm site code, certificate and CA fingerprints/validity, signing-key ID,
   supported manifest version, queue state, and a signed test receipt on both
   sides.

The former clinical-ADMIN enrollment, export-policy mutation, and delivery
trigger APIs, together with the authoritative `scripts/enroll-central.sh`
workflow, are retired in 1.2.1 because they could not enforce the separate
Status password confirmations and audit locks. See
[Central transport control from Status](central-status-control.md).

Do not send private keys, patient keys, database credentials, or the raw
patient identifier to Central.

## Synthetic release proof

The release gate does not require a checkout or running copy of the Central
product. `npm run test:central-full-story` starts a test-only HTTP fixture from
the pinned, pure exchange contract and drives the real Hospital delivery worker
and a disposable migrated PostgreSQL database. There is no sibling-repository
import and no production fallback to the fixture.

The proof starts with configured transport but unapproved clinical export and
confirms that no request leaves Hospital. It then approves export and verifies
automatic delivery of every eligible finalized case, encrypted multipart UPSERT,
a Central-signed receipt, the local checkpoint, withdrawal, resend, and the
final accepted state. Negative
controls prove that a bad receipt signature and an invalid sequence/previous-
batch checkpoint cannot advance the local checkpoint. The same positive story
runs against the current and immediately previous versions declared in
`scripts/exchange-contract-support.json`.

All fixture observations are summaries. The test plants an unmistakable
local-only patient-identifier sentinel and proves it is absent from the
decrypted exchange tables, manifests, encrypted artifact inspection, case UI
projection and captured worker logs. This is a protocol and application release
proof; mTLS certificate negotiation and a deployed Central database remain part
of the disposable installation acceptance drill.
