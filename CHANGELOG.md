# Changelog - LOSPOR Hospital

## [1.2.0] - 2026-08-25

### Fixed

- **The PWA's offline case draft and reconnect sync now work at all for a web
  session.** A signed-in web session authenticates through an HttpOnly cookie
  and carries no JS-readable bearer token, but identity resolution for the PWA
  went through three places that each still tried to decode one anyway --
  `getAuthenticatedIdentity()`, sign-in's own bootstrap check, and the header
  builder's account-match guard on outgoing writes. All three silently
  resolved to "nobody," every time, for every PWA web user. Server-side
  autosave for an already-created case never needed local identity, so this
  was invisible online; every identity-gated *local* affordance was
  structurally broken underneath it: a new case created while offline could
  never actually save to the device (the UI claimed "Saved locally" and lied),
  and a case that did get created there would fail to sync back to the server
  once reconnected. Identity now comes from the same session the server
  already trusts, checked directly rather than decoded from a token that never
  existed for this platform, and the sign-in/administrator-MFA paths now
  require it before ever reporting "signed in." Reconnecting no longer waits
  out a fixed background interval to notice: becoming ready to sync, and the
  browser's own connectivity event, both prompt an immediate attempt. The
  identity check is bounded by a timeout so a stalled request can no longer
  hang app startup or a clinical write, and a genuine connectivity failure
  there is no longer reported to the clinician as if a different account had
  signed in.

- **Hospital accounts now use explicit usernames, not email identity.** Guided
  installation requires a first clinical-administrator username; Status
  provisions Member, HOD, and research-only accounts with the same exact
  3–64-character ASCII rules. Spelling/case is preserved while login,
  uniqueness, and durable reservation are case-insensitive. Optional contact
  email never becomes a login or recovery fallback. Activation is independent
  of email verification, the old clinical-admin password/Admin creation route
  is closed, and a username remains reserved until final anonymization.

- **Calculated-guidance readiness now comes from one exact database truth.**
  Hospital runtime, pediatric runtime, capabilities, the private control plane,
  Status, and the installer report now require the selected published PLATFORM
  preset to match the bundled adult/pediatric v2 identity, version, validated
  rule keys, exact rule/profile counts, and persistence-normalized content and
  source-reference SHA-256. Policy is reported separately: a default-Yes or
  later-enabled checkbox cannot turn a missing/changed baseline into Ready, and
  Web/PWA guidance fails closed while manual charting remains available. Status
  shows explicit **Ready / Not ready** and **Готово / Не е готово** states with
  sanitized counts and hashes, never rule JSON, sources, names, free text, or
  actor identity. Clean installation now invokes the owner release provisioner
  exactly once with explicit `--apply` after migrations/bootstrap, then requires
  both exact adult and pediatric baselines to report **Ready** before service
  start, doctor, or success. Collision, partial-state, conflicting-selection,
  and content-drift failures stop installation; the independent policy choices
  and manual charting remain available.

- **Hospital overlay verification follows the isolated E2E topology.** The
  structural contract now requires the Web E2E API server's dedicated 3302
  port, `../api` working directory, and `reuseExistingServer: false` marker.
  It no longer expects the retired shared-server command that could borrow the
  public demo on port 3002 and make Hospital account/research results
  meaningless.

- **Update-authority contract checks remain exact after terminology controls.**
  The release test now inspects only the two `LOSPOR-HOSPITAL-UPDATE-REQUEST-V2`
  envelopes when proving that Status cannot choose trusted release identities;
  the separate fixed-shape terminology envelope no longer creates a false
  failure while retaining its own dedicated safety tests.

- **Hospital-to-Central delivery now has a mandatory synthetic full-story
  release gate.** The gate drives the real Hospital PostgreSQL reservation,
  archive, encryption, multipart upload, signed-receipt and checkpoint path
  against an independent test-only Central protocol fixture built solely from
  the pinned exchange contract. It covers explicit appliance-wide export
  approval, automatic UPSERT of every eligible finalized case, withdrawal,
  resend after `WITHDRAWN`, bad receipt signatures,
  checkpoint refusal, the current and previous supported contract versions,
  and PII-free fixture observations, UI projections, logs and artifacts. The
  compatibility matrix is now a checked release input instead of a duplicated
  comment in the pin verifier.

- **The complete appliance update pipeline is now a mandatory release gate.**
  Hospital quality CI invokes `npm run test:update-pipeline`, and the release-
  workflow contract rejects any future workflow that drops it. This closes the
  gap where compatibility, shared-lock, capacity, retention, activation-
  recovery, root-agent/systemd, credential, terminology, observability, and
  release-metadata tests existed but were not all required before publication.

- **Bulgarian and English operator surfaces are now a mandatory release gate.**
  One CI command covers paired operator documentation, complete installation-
  guide parity, preserved technical tokens, network/terminology contracts,
  Bulgarian-default and explicit-English command output, and direct English-
  only prompt detection. The shell contract now also distinguishes a working
  Python interpreter from the non-functional Windows Store launcher alias, so
  Windows verification cannot report a false translation failure. The release-
  workflow contract rejects removal of the gate.

- **The Hospital HOD research journey now matches the grant policy.** The Web
  E2E suite expects an HOD without an explicit `ResearchAccessGrant` to receive
  `RESEARCH_ACCESS_REQUIRED`, removing a stale assertion that treated clinical
  departmental authority as automatic research permission.

- **Release CI now runs every Hospital client E2E suite.** The clinical job
  executes the complete Web, PWA, and Research Browser Playwright suites instead
  of four selected specs. Release-workflow regression tests require all three
  aggregate gates, so account, role, pediatric, offline, visibility, research,
  print, and clinical journeys cannot silently fall out of publication checks.

- **Local account activation now has a browser-level release story.** A
  test-only Status bearer creates a Member through the private Hospital route;
  Playwright replaces the activation link, proves the old and consumed links
  fail, sets the password through the fragment-only page, signs in, accepts
  onboarding, and verifies active directory state. No public registration or
  mail provider is enabled.

- **Hospital E2E now rejects public self-registration.** The copied demo test
  previously expected registration to succeed and therefore had never been a
  truthful appliance gate. It now requires `SELF_REGISTRATION_DISABLED`; the
  private Status activation story is the only tested account-creation path.

- **Research grant and revocation now have a browser-level release story.** A
  disposable designated operator issues an HOD an exact institution-scoped,
  aggregate-only grant through the private Status control route; Playwright
  proves queries become available while case inspection remains denied, then
  proves revocation removes access on the very next request. Failure cleanup
  revokes the disposable grant as well, so the configured CI retry starts from
  the same denied state instead of inheriting authority from the first attempt.

- **The Hospital E2E database now seeds valid 1.2.0 research authority.** The
  synthetic researcher is explicitly research-only and its aggregate grant has
  a bounded expiry and explicit least-privilege fields. A fresh database built
  from migrations therefore satisfies the database research guards before
  Playwright starts.

- **Hospital Web E2E no longer borrows public-demo development servers.** The
  harness uses dedicated configurable Web/API ports, refuses silent server
  reuse, and launches Next from the correct application directory. Its Pixel-5
  project is named `mobile-web`; the separate `apps/pwa` suite remains the real
  Expo PWA release gate.

- **Research grant issuance now keeps protocol prose out of audit evidence.**
  The transactional audit row records only that a purpose was supplied. It no
  longer passes the free-text purpose into the privacy guard and rollbacks the
  otherwise-valid grant.

- **The local activation release story now follows the versioned response and
  durable onboarding state.** Activation-link replacement reads the API's
  `oneTimeLink` envelope, and the onboarding dialog is semantic, suppresses the
  automatic dashboard tour, and is required to remain accepted after reload.

- **A partial owner localization import can no longer be mistaken for release-
  ready Hospital clients.** The current pre-localization API, Web, PWA, and
  Research Browser pins remain explicitly pending and green for ordinary
  development quality, but the tag-triggered candidate workflow refuses that
  pending state before release work. Once any pin advances, provenance
  verification also fails closed unless all four advance together with
  Bulgarian-default login, visible Bulgarian/English choice, account-locale
  takeover, and the corresponding assertions in the three full Playwright
  suites. Status retains its existing focused unit/integration coverage because
  it has no browser harness.

- **Restore now refuses an installation with the wrong OMOP pseudonym salt.**
  Fresh configuration persists a canonical SHA-256 fingerprint of the exact
  32-byte lowercase-hex `OMOP_PSEUDONYM_SALT`; every closed, authenticated
  backup manifest binds that non-secret fingerprint. Restore compares it during
  read-only preflight and returns `RESTORE_OMOP_PSEUDONYM_SALT_MISMATCH` before
  any database mutation. Readiness, generation, configuration, backup, restore,
  English/Bulgarian recovery, and security contracts document and test the
  installation-bound escrow requirement. No salt rotation or Central protocol
  is introduced.

- **Production Hospital no longer disables pediatric charting by omission.**
  The API now receives the fixed `PEDIATRIC_MODE_ENABLED=true` product
  capability independently of the adult and pediatric calculation-guidance
  choices. Status displays the live pediatric charting capability, bundled
  release-review/ruleset facts, database-backed baseline readiness, and
  minimum-client facts beside the two prospective-guidance
  switches, with explicit Bulgarian/English wording that guidance-off still
  permits manual pediatric documentation. Compose and fail-closed Status
  contract tests protect the separation.

- **TLS health now covers every served identity, including the independent
  outage path.** The privacy-safe host probe checks both clinical and research
  SNI certificates in ACME/local modes, the already dual-name operator
  certificate in operator mode, and the Status loopback fallback certificate,
  then publishes only the worst fixed enum. Status secret provisioning retains
  a sound fallback pair, but validates and replaces it when it is malformed,
  mismatched, or inside the 30-day renewal window. A hardened persistent timer
  repeats the check twice daily, restarts only Status, and acknowledges the
  durable reload marker only after the loopback listener serves the exact new
  certificate fingerprint. It shares the backup/update maintenance lock so it
  cannot restart Status mid-migration or mid-activation. Tests cover research-only expiry, valid-pair
  retention, imminent expiry, key/certificate mismatch, restart suppression,
  fail-closed reload acknowledgement, host-side Unknown state while reload is
  unverified, and isolation from unrelated Status secrets.

- **Central case delivery is automatic and its exceptions are atomic.** Once
  Status enables both transport and the clinical-delivery policy, every
  finalized eligible case is queued without a per-case include/approve step.
  Hospital Web shows a fixed pseudonym-free state and only confirmed withdraw
  or resend actions. The immutable creating Member may act on their own case,
  including through a privacy-minimal paginated Web list after transfer, without
  regaining clinical-record, print, or research access.
  an HOD on their department, and an Admin within Admin scope; Mobile/PWA has no
  Central controls. The API serializes each action with batch reservation and
  commits bounded audit evidence in the same transaction.

- **Hospital legal pages no longer advertise English-only browser titles in a
  Bulgarian session.** Terms and Privacy now generate locale-aware document
  titles, and generic Bulgarian references to artificial intelligence use
  `ИИ`; the official provider name `Mistral AI` remains unchanged. A focused
  localization test protects both pages.

- **Status no longer exposes internal account or Central queue enum values to
  operators.** Research account roles and every delivery-queue/batch state now
  have explicit Bulgarian and English labels. Queue summaries are rendered as
  bounded operational facts instead of raw serialized JSON, so neither schema
  details nor untranslated codes leak into the interface.

- **The update signal has never been publishable.** `check-for-update.sh` writes
  it through the `tools` container, which carries `cap_drop: [ALL]` while
  `/signals` is owned by 100:101 — so root without `DAC_OVERRIDE` could not
  write there. The Status page said an update had never been checked for while
  the answer sat in `.data/update-status.tsv`. This was the third instance of
  one 1.1.0 mistake, after `delivery-worker` and `backup`, so a hardening test
  now enumerates every service mounting `/signals` writable and asserts it can
  actually write to it.

- **`doctor.sh` blocked every update on a LAN install**, fetching the clinical
  domain with neither `--cacert` nor `--insecure`. Under `local_certs` that can
  never succeed: 1.1.0 → 1.1.1 installed, migrated, seeded and came up healthy,
  then failed the health gate on a certificate error and rolled back — and the
  rollback's own `doctor.sh` failed identically, leaving the activation lock for
  an operator to resolve.

### Added

- **Local clinician help and privacy-safe support reporting.** The guided
  installer accepts an optional validated internal HTTPS or bare `mailto:`
  support destination and publishes only that non-secret capability to the
  clinical clients. Mobile/PWA includes version-matched offline help, replaces
  the profile/report placeholders with real workflows, labels PWA reminders as
  foreground-only, and previews a bounded diagnostic summary before any
  deliberate copy/share/mail action. Patient, case, clinical, account,
  institution, token, and free-text data are excluded; nothing is transmitted
  automatically. Invalid destinations fail closed independently in the
  installer, Hospital API, and client.

- **Supported rotation for ordinary appliance credentials.** A root-only,
  two-phase host workflow now prepares a protected transaction, shares the
  backup/update maintenance lock, applies one monotonic generation, verifies
  the live services, and either commits or restores the exact prior state.
  Separate scopes cover the session/JWT secret, delivery/research/cron/snapshot
  workers, scoped Status↔API tokens plus the read-only database probe, and the
  main PostgreSQL role; `ordinary` coordinates all four.

  Worker and Status bearers use a bounded current/previous overlap: consumers
  accept both, producers move to the new value, then the predecessor is removed
  and live requests prove it is rejected. The Status operator identity proof is
  derived with the exact bearer that authenticated each overlapping request.
  PostgreSQL verifies both new-password acceptance and old-password rejection
  over TCP. Session rotation deliberately accepts no predecessor and signs
  everyone out. Every phase is recorded in a fixed, secret-free host audit;
  credentials travel only through protected files or process standard input.
  The commit boundary is durable: failure before the boundary restores the old
  state, while failure to write final bookkeeping or remove the protected old
  copy after a verified `COMMITTED` can never roll back live credentials.
  `state` reports that residue and a narrowly validated `cleanup` command
  removes only committed transaction material. A prepare that cannot append its
  first audit fact removes its unpublished transaction. Tests cover those
  failure boundaries, commit, overlap retirement, automatic rollback,
  hard-link refusal, redaction, API routes, Status events, Compose wiring, and
  fresh generation. The real outage-duration/PostgreSQL drill remains a Linux
  release gate.

  Patient/data/MFA/backup seal keys and Central mTLS/site-signing identity are
  explicitly excluded: replacing them without a versioned migration or Central
  continuity protocol would destroy decryptability or identity continuity.
  English and Bulgarian runbooks state the supported commands and this boundary.

- **Mandatory two-step verification for Status operators.** A valid Status
  password now creates only a five-minute one-use challenge and cannot create a
  session. First sign-in for each credential generation enrolls RFC 6238 TOTP
  through a locally rendered QR/manual key and shows exactly ten one-use
  recovery codes once. Seeds use AES-256-GCM under a new dedicated Status-only
  key; recovery codes are stored only as operator/generation-bound SHA-256
  hashes. TOTP-step replay, recovery-code reuse, expired/reused challenges, and
  concurrent credential changes fail closed. Bulgarian and English cover
  enrollment, verification, errors, and the one-time code handoff. Console
  recovery remains a separately audited, restricted break-glass session.

- **Hospital-only shared account administration.** The API environment now
  carries both explicit signals required by the shared administrator lifecycle
  capability. A deliberate upstream import can expose it on the appliance,
  while the online serverless demo remains disabled by default.

- **Hospital account provisioning in Status.** Self-registration remains
  disabled, while a normal appliance-operator Status session can create a
  clinical Member, clinical HOD, or research-only account. It shows a 72-hour
  activation link once as copyable text, a printable handout, and a locally
  generated QR code; no email provider is required. Reissue invalidates every
  earlier unused activation link. Active accounts can receive an 8-hour local
  recovery link under the same one-use/invalidation rules.

  Tokens have 256 bits of entropy, are stored only as SHA-256 digests, travel
  in URL fragments so access logs never receive them, and are claimed with a
  conditional update so concurrent use has exactly one winner. Each lifecycle
  mutation and its audit evidence commit in one PostgreSQL transaction; URLs,
  tokens, digests, passwords and operator identity never enter audit detail or
  Status history. Console-recovery Status sessions cannot use these controls,
  while clinical administrators, mismatched legacy authority, and the
  designated appliance operator remain outside Status credential actions.
  Concurrent reissue is serialized so only the last replacement remains
  active. Status itself receives no clinical/research session or data
  authority.

- **Bulgarian-first Status interface.** The independent Status login,
  availability dashboard, incident and event history, appliance facts, release
  download/apply flow, and destructive update confirmation now render fully in
  Bulgarian or English. `LOSPOR_DEFAULT_LOCALE` selects the first view and a
  prominent БГ/EN control stores an HttpOnly Status-only choice. Tests cover
  both languages, complete operational-code parity, safe return paths, and the
  existing authentication/update boundaries.

  The control plane follows the same rule: account roles, research grants,
  Central queue totals, current batch state, guidance, and external-AI policy
  render localized operator language while standardized names and protocol
  identifiers remain exact.

- **Complete bilingual backup results in Status.** The finalized backup signal
  success and terminal failure allowlist now has plain Bulgarian and English
  explanations for every code. Lock contention (`BACKUP_BUSY`) remains a
  process exit result, not a replacement for the active backup's Status marker.

  The host backup, backup-configuration, restore, and protected credential-
  rotation commands now use the same Bulgarian-first appliance setting, with
  an English one-command override. Operator prose, confirmations, summaries,
  and failures are bilingual while recovery codes, typed confirmation values,
  scope/action tokens, environment names, journal phases, paths, and commands
  remain exact. The release gate inventories these commands, rejects new direct
  English-only shell messages, exercises both usage languages, and asserts that
  every credential-rotation failure carries paired Bulgarian and English text.

- **Privacy-safe host monitoring and truthful update readiness.** A hardened
  root-side systemd one-shot/timer now reduces storage capacity, clock sync,
  verified local/off-host backup age, update-agent heartbeat, certificate
  expiry, expected service health, and update-supply readiness to one exact
  enum-only `host-observability.v1.json` projection. Status rejects extra
  fields and unknown values and turns a missing/invalid or three-minute-stale
  projection into Unknown rather than a false green state. Bulgarian and
  English labels and explanations cover every result. The projection now also
  reduces unfinished/unsafe restore evidence and the release-activation lock
  to fixed `clear`/`present`/`invalid` states; journal names, database names,
  paths, processes, backup identities, and timestamps stay on the host.

  A supported Nagios-style local check strictly parses the same projection,
  rejects duplicate keys, links, unsafe ownership/mode, malformed enums, and
  stale/future observations, and returns standard 0/1/2/3 status codes. Its
  output is limited to fixed result codes and never forwards paths, logs,
  identifiers, credentials, or arbitrary input.

  Connected mode now requires the exact root-owned, mode-0600, non-linked
  GitHub Releases token and GHCR username/token created by the supported
  stdin-only provisioner. Readiness and Status report only configured/missing,
  never values or unsafe-file details. Offline supply is an explicit mode and
  remains entirely credential-free. The normal installer verifies and starts
  the independent one-minute monitor before declaring the appliance healthy.

- **Authenticated four-hour backup and fail-closed restore policy.** Scheduled,
  manual, update, and restore workflows share one backup mutex and publish an atomic
  manifest-last recovery object only after capacity, dump catalog, checksum,
  schema, migration, and compatibility evidence pass. The manifest binds the
  object to this site, appliance, release, exchange/data-dictionary contract,
  PostgreSQL major, and clinical key fingerprints without carrying PHI or raw
  secrets. Its separate HMAC key is persisted with a protected local escrow;
  updates validate and preserve both rather than rotating them.

  The appliance now targets a four-hour RPO, keeps every verified point for 48
  hours and 14 daily points thereafter, and protects pre-update/pre-restore
  points. A fixed hospital-owned off-host hook reports a durable acknowledgement
  separately from local success. Restore verifies every boundary before an
  outage and defaults to an isolated temporary database; emergency in-place
  switching additionally requires an authenticated safety snapshot, exact
  typed confirmations, a fail-closed journal, and the restore pre-open doctor.
  English and Bulgarian runbooks and negative/concurrency tests cover the
  complete contract. WAL/PITR remains explicitly outside 1.2.0.

  A second persistent `flock` inode is shared with the host release agent, so a
  backup cannot overlap migrations or service replacement. Maintenance
  contention defers the backup before any database read with the stable
  `BACKUP_MAINTENANCE_BUSY`/exit-75 contract; neither side replaces the inode.

- **Bulgarian-first guided installation.** The first screen is deliberately
  bilingual, with Bulgarian preselected and English obvious. The choice changes
  every remaining installer prompt immediately and is persisted as
  `LOSPOR_DEFAULT_LOCALE` for API, Web, Browser, Status, and a native client's
  first unauthenticated screen. An explicit login choice and then the account
  preference still take precedence. Unsupported locale values fail before the
  release launcher runs.

- **Optional external AI is a governed installation and Status choice.** The
  guided installer asks separately from adult/pediatric guidance and defaults
  to Yes. A Mistral credential is optional at install, travels only over a
  hidden third standard-input line, and is sealed immediately with a 32-byte
  API-only appliance key. Plaintext never enters `.env`, Compose metadata,
  argv, logs, audit detail, Status, or capability responses. Status can later
  enable/disable the policy and replace/remove the credential after password
  reauthentication and an audit reason. Clients consume the live capability
  state (`ENABLED`, `DISABLED_BY_DEPLOYMENT`, or
  `PROVIDER_NOT_CONFIGURED`) and do not render unavailable upload/advisor/OCR
  inputs. Direct routes preflight policy before clinical reads and open the
  credential only immediately before provider egress.

  The backup manifest binds the raw 32-byte seal-key SHA-256. Restore compares
  it before database mutation and fails closed with
  `RESTORE_EXTERNAL_AI_SEAL_KEY_MISMATCH`, so a restored encrypted credential
  can never become silently unreadable. The seal key is part of the required
  encrypted off-host secret escrow.

- **A clean guided installation can now pass its own readiness gate.** Fresh
  installs validate the explicitly collected proposed configuration in a
  read-only pre-install mode instead of requiring the `.env` file that the
  later installer is responsible for creating. Manifest authentication and
  the resolved Compose model are then checked after protected secrets exist.
  The optional bilingual off-host-backup prompt accepts only an absolute,
  regular executable; a blank answer installs the truthful deferred hook.

- **Installation success now means the appliance answered.** Final Compose
  startup has a five-minute health deadline, creates and authenticates a real
  recovery object, and runs the same configured-domain/TLS/API/Web/PWA/Browser/
  Status/operator/worker doctor used operationally. A restart loop, unhealthy
  service, failed backup, or invalid latest manifest stops before the success
  message. Missing licensed terminology and missing off-host acknowledgement
  remain explicit critical go-live warnings rather than being hidden.

- **An update can be applied from the status page.** An appliance on a hospital
  LAN is often unreachable by SSH, and the person who notices an update is
  rarely the person with a console. Status now asks and a host agent applies:
  Status runs unprivileged with no Docker socket and cannot apply anything
  itself, which is what makes a control reachable from a browser safe to offer.

  Downloading is one press because it changes nothing that is running. Applying
  is two, and the first acts on nothing at all — it renders a confirmation that
  says plainly the clinical services will restart. Outside the maintenance
  window (20:00–06:00 by default) a request is queued rather than refused, and
  the page names when it will run; applying immediately is a separate control.

  The agent refuses a request naming an installed version that is not the one
  installed, one it has already seen, an expired one, one from a recovery
  session, and anything at all while a release-activation lock exists — which it
  never removes, because that lock means either an apply is running or a
  rollback did not finish, and only a person can tell which. A failed apply is
  terminal: an agent that retried across a reboot would turn one operator's
  intent into two attempts on a clinical database.

  Installing the agent is optional. Without it the appliance behaves exactly as
  it always has, and the status page reports what is available.

- **Operator-supplied certificates.** `HOSPITAL_TLS_MODE` selects
  `acme | local | operator`. Most hospitals run an internal CA that every
  managed device already trusts, and the appliance could not use a certificate
  from it — leaving only ACME HTTP-01, which needs inbound internet a hospital
  will not grant a clinical box, and `local_certs`, whose 12-hour certificates
  expire while an appliance is powered off overnight. Verification stays real in
  all three modes; `--insecure` is not introduced.

  The mode now expands only to fixed Caddy snippets and an exactly paired
  Compose profile. Port 80 exists only for ACME; operator/local installations
  no longer reserve it. Install and update parse the real mode-expanded
  Caddyfile before starting listeners. Operator certificates are checked for
  key match, both appliance DNS identities, server EKU, validity, complete CA
  chain and a 30-day renewal floor. The conditional ACME listener reuses the
  verified Caddy image and is included in the signed-release Compose gate.

- **Exact Research and Status network boundaries.** The bilingual guided
  installer requires separate Research/VPN and IT-management CIDRs,
  canonicalizes IPv4/IPv6 values, and refuses empty, malformed, world-wide and
  old all-RFC1918 placeholders. A confirmed exceptional override remains
  narrower than a world-wide range. The rollback-safe change command validates
  Compose and Caddy before replacing `.env`; readiness reports the exact
  boundary it checked. Free-form Caddy configuration variables can no longer
  bypass an allowlist.

- **Governed terminology generation and clinical go-live gate.** An approved
  package has a strict versioned manifest, exact file inventory, SHA-256 for
  every byte, licence-approval evidence and explicit minimum counts. The
  importer uses only the pinned tools image, stages an isolated database,
  supports explicit resume, checks bilingual labels/mappings/relationships,
  rehashes the source before two-name activation, and retains the prior
  generation for explicit rollback. Full manifest evidence is bound to the
  database generation, so stale host evidence or an older restored database
  cannot pass. A failed post-activation gate automatically restores the prior
  generation. No licensed dataset is bundled or downloaded.

  Status now provides a bilingual, authenticated terminology-generation page.
  It shows only bounded package provenance and host workflow state, and offers
  import, exact-package resume, rollback, and permanent finalization to a normal
  password+MFA session after fresh password reauthentication and explicit
  action confirmation. Status can submit only a fixed enum and one direct
  package-directory label; it cannot upload/download files or choose a path,
  URL, command, manifest, database, image, or source identity. The root host
  agent validates inode/link safety, age and replay, dispatches one packaged
  wrapper, shares the persistent backup/update I/O lock, and retains ambiguous
  interrupted operations for console review instead of retrying. Its strict
  read-only projection excludes licensed bytes, paths, filenames, database/run
  names, logs, credentials, operator email, and patient data. Console-recovery,
  console-only, stale-agent, busy, and needs-operator states fail closed.

- **Fail-closed restore pre-open doctor.** Before an emergency restore may
  restart Caddy, `doctor.sh --restore-preopen` proves PostgreSQL, the pinned
  migration/schema manifest, internal API live/readiness, Web, PWA, Research
  Browser, Status, appliance-operator consistency and strict terminology
  readiness. Only then does it emit the stable `RESTORE_PREOPEN_OK` proof;
  public DNS and TLS are deliberately checked by the ordinary doctor after the
  edge reopens.

- **Signed releases.** An Ed25519 key held off GitHub, confirmed once by
  fingerprint at installation, after which every release verifies itself. This
  replaces reading a 64-character digest down the phone before every update, and
  it is what makes an unattended download safe. A key CI could use would sit in
  the same trust domain as the registry it pushes to, so
  `release-workflow-contract-lib.mjs` keeps candidates unsigned and refuses any
  publication workflow that receives private signing material or signs inside
  Actions.

  Manual publication now accepts only the public canonical-base64 form of the
  reviewed raw 64-byte signature plus its separately recorded SHA-256. Both
  jobs independently verify the signature, digest, exact lock, and unchanged
  reviewed public key; signed online and offline installation proofs run before
  any external mutation. The raw `.sig` is mandatory in the final immutable
  asset allowlist and is preserved beside the installed release lock.

  Once a key is pinned a signature is **mandatory**, not a setting: a missing
  `.sig` is refused exactly like a bad one. If it merely skipped the check,
  anyone able to serve a modified release could delete the signature and the
  appliance would drop back to digest-only verification, at the attacker's
  choosing.

### Vendored

- api, web, pwa, and core at **9.3.1**, browser at **0.6.0**. Carries what
  9.3.0 already brought — member-initiated case handover, and the
  case-numbering fix that came with it: numbers now come from a forward-only
  counter per clinician per year, so handing a case away can no longer lower
  the ceiling and reissue a number already printed on a chart — plus what
  9.3.1 adds on top:
  - A case now records its immutable creator separately from its current
    assignee. Handing a case to a colleague in the same institution no longer
    revokes the creator's own read access to that case's AI advice.
  - Password-reset token claiming is conflict-safe under concurrency: a token
    is claimed by exactly one request, and claiming one revokes every open
    session and clears the recovery-required flag in the same transaction.
  - Saved research cohorts carry optimistic concurrency: an edit opened
    against a stale copy is refused with `COHORT_CHANGED` rather than
    silently overwriting a colleague's more recent change.
  - OMOP exports derive their pseudonymous person and visit identifiers from
    `researchId` rather than the less-private case-code-derived value used
    before.

## [1.1.1] - 2026-08-19

Vendors lospor-api 9.2.2.

- **A diagnosis can be coded on a new appliance.** `/v1/search/icd10` reads the
  `Icd10Code` table and nothing else, and the appliance seeded the Core option
  catalog at install and nothing else -- ICD, ATC and the OMOP tables come from
  a licensed package the operator imports separately. So the diagnosis field
  returned nothing on every appliance ever installed, and an empty dropdown
  reads as "no such code" rather than "nothing is loaded". Preoperative
  assessment could not be completed, and so no case could reach a protocol.

  The codes were never missing. All 16,175 of them, with English and Bulgarian
  labels, already ship inside vendored Core for the phone to search offline;
  only the database could not see them. Install and update now seed
  `Icd10Code` from that same bundle, after migrating.

  Insert-only: a site that has imported its approved vocabulary keeps every
  label it imported, and `seed-vocabularies.ts` still upserts, so a licensed
  import always wins over the bundle. Recorded cases are unaffected either way,
  because a diagnosis is denormalised onto the case when it is chosen.

  Update seeds as well as install, because every appliance running 1.1.0 has an
  empty table today and would otherwise stay that way.

## [1.1.0] - 2026-08-18

Vendors lospor-api 9.2.1, and lospor-app, lospor-mobile and lospor-core 9.2.0.
Speaks exchange contract 2.2.0.

The whole of this release comes from an audit of 1.0.0. Every finding it raised
was checked against the code, and every one of them was real. Some live in the
appliance and are fixed here; the rest were defects in the shared clinical code,
which the public deployment runs too, and were fixed upstream and vendored in
rather than patched into the copy.

### From upstream 9.2.0

- **Finalization records are append-only.** `CaseSnapshot` called itself
  immutable and was written with an upsert, so finalize → unfinalize → edit →
  finalize destroyed the original attestation. A database trigger now rejects
  UPDATE and DELETE.
- **A case stays at the hospital that recorded it.** An administrator could
  transfer a case across institutions, and the transfer rewrote the case's
  institution — so the record, the printed protocol and the OMOP care_site all
  said the operation had happened somewhere it had not. It also desynchronised
  patient identity at the Central boundary. Refused outright now.
- **Audit entries commit with the acts they record.** Transfer, finalization,
  unfinalization and research grants wrote theirs after the response had been
  sent, through a helper that swallowed its own failures.
- **Every conflict override is recorded** instead of erasing the evidence that
  there had been a conflict at all.
- **Administrator account deletion soft-deletes**, rather than raising an
  unhandled 500 for any clinician holding a case and, where it succeeded,
  destroying the record of what the account had been permitted to see.
- **A risk score says how much of it was actually asked.** The calculators count
  an unasked criterion as absent, deliberately; the card showed only a number
  and a colour band, so a score computed from three answered criteria read
  identically to one computed from six.

Two migrations apply on start, in addition to the appliance's own:

- `20260818120000_append_only_finalization`
- `20260818160000_drop_include_exact_times`

### Data protection

- **The retention purge runs.** `/v1/internal/purge-deleted` anonymises accounts
  deleted more than 30 days ago and prunes their rate-limit rows. Its own
  comment says it is invoked by Vercel Cron, "see vercel.json" — and an
  appliance has neither. The delivery worker only ever called the Central
  delivery endpoint. So on every appliance ever built, the erasure job had no
  scheduler and had never run once.

  It could not have run even if something had called it: the route
  authenticates with `CRON_SECRET`, which the API has always been given and the
  worker never was.

  It now runs daily inside the delivery worker, and the Status page reports it
  as **Data retention purge**. A missing signal reads as unknown, never as
  healthy — an erasure obligation nobody can produce evidence for must not show
  green, and that is the state every appliance has been in until now.

- **`HOSPITAL_PATIENT_HMAC_KEY` is documented as irrotatable.** It derives the
  unique index a patient is found by and feeds every exported pseudonym.
  Replacing it does not re-protect anything: it makes every existing linkage
  unfindable and gives everyone already delivered to Central a second identity
  there. The security documentation said to restore service with "reviewed
  replacement credentials" without distinguishing it from keys that can
  genuinely be rotated. It is now marked escrow-only, with the consequences
  stated, and the incident checklist excludes it rather than implying a rotation
  that would cause the harm it is meant to contain.

  No re-key procedure ships. Writing an honest one means a coordinated migration
  with Central, and that is not this release.

### Hardening

- **Every service is hardened, not three of them.** `read_only`,
  `cap_drop: [ALL]` and `no-new-privileges` were set on the secrets initialiser,
  the delivery worker and Status — and on none of the containers that hold
  clinical data or terminate TLS. All eleven carry them now. Four add back a
  named capability and say why: PostgreSQL switches user through `chroot`,
  nginx spawns workers, Caddy binds ports 80 and 443, and the secrets
  initialiser sets ownership on first run.

- **The delivery worker no longer runs as root.** Its image ends on
  `USER curl_user`, and Compose overrode it with `user: "0:0"` under a comment
  that said root was selected deliberately without ever saying what needed it.
  It fetches two internal URLs and writes a signal file.

- **Framing is refused on every route.** The web app set `X-Frame-Options` and
  `frame-ancestors` itself; nginx served the phone app with neither. So `/` could
  not be framed and `/app` could, on the same hostname — and `/app` is where
  phones log in. Both now come from the shared Caddy header set, appended rather
  than set so the web app's own richer policy survives.

- **`/v1/internal/*` is refused at the edge.** The catch-all `/v1` rule proxied
  it straight through. The delivery worker reaches those routes on the internal
  network, so nothing needed them published. They answer 404, not 403, because a
  403 confirms the route exists.

### Capacity

- **PostgreSQL is tuned for the machine the installer demands.** The readiness
  check requires 16 GiB and PostgreSQL was running on stock defaults —
  `shared_buffers` at 128 MB and a planner costing random reads as if the disk
  had to seek. It now has a 4 GiB ceiling and settings sized to match, plus a
  1 GiB `/dev/shm`; the Docker default of 64 MB is small enough to fail a large
  research query for reasons that look nothing like their cause.

- **Every service has a memory limit.** There were none. A heavy query in the
  research workspace could exhaust the host and take PostgreSQL and Status down
  with it — and Status is the service that is supposed to survive a clinical
  outage. It now has a small guaranteed ceiling of its own.

### Correctness of the bundle

- **The appliance shipped core 9.1.0 while claiming 9.1.1.** `verify:upstream`
  compares git tree ids, which proves a vendored path has not drifted since it
  was pinned but says nothing about which version is in it — `stamp:upstream`
  records whatever is there, so a partial re-vendor is stamped as happily as a
  complete one. Nothing ran differently, because core 9.1.0 and 9.1.1 differ in
  no source file, but every provenance artefact describing the bundle was wrong.

  The vendored copy now matches its pin, as do the three app lockfiles, which
  had drifted further still — api and web recorded core 9.0.1 and the phone app
  recorded 8.5.0. `verify:upstream` now compares versions as well as trees.

- **`test:merge-safety` runs in CI.** It was referenced by no workflow, so
  vendor-merge and overlay verification only ever ran on someone's machine.

### Installation

- **A guided installer**, `scripts/install-guided.sh`. It asks for the release
  lock digest that was sent separately, compares it, and stops if it differs;
  then collects the site and administrator details, shows the readiness report
  in full, and runs the ordinary launcher.

  It is a front end and nothing more. `run-online-release.sh` still verifies
  the lock and pulls every image by digest, `install.sh` still creates the
  secrets and the first administrator, and no check it reports can be continued
  past. An installer whose checks can be clicked through is worse than none,
  because it looks like assurance.

  It uses `whiptail`, which ships with Ubuntu Server, and falls back to plain
  prompts where that or a terminal is missing — a clinical host should not have
  to install anything to run the installer.

- **`generate-secrets.sh` honours `ACME_EMAIL`, `HOSPITAL_CLINICAL_DOMAIN` and
  `HOSPITAL_RESEARCH_DOMAIN` from the environment**, as `install.sh` has always
  honoured its own. Previously those three could only be typed, so anything
  driving the install non-interactively had to feed them positionally into
  standard input — and got them out of step the moment `.env` already existed,
  writing a password into a domain field with no error at all. That happened
  during release verification.

  It also names the variable it is missing instead of stopping silently. At end
  of input `read` fails, and under `set -e` the run simply ended: no `.env`, no
  message, no indication which value was absent.

  And it no longer reads a value from standard input at all. Honouring the
  environment fixed the instance; the class survived, because a value absent
  from the environment still fell back to reading whatever was on the stream.
  Adding a fourth prompt in this release brought it straight back: `install.sh`
  runs this script and then reads the administrator’s password from that same
  stream, so the new prompt consumed that password and wrote it into `.env` as
  the sender address for every account email. Silently, and permanently — a
  second run finds `.env` present and skips generation entirely.

  A non-interactive install now supplies every value in the environment, and a
  missing one names itself and stops. A prompt added here without a matching
  question in `install-guided.sh` now fails the test suite rather than an
  install.

### Vendored and reviewed

- **Vendors lospor-api 9.2.1**, which holds deepmerge-ts at 8.0.1 for
  CVE-2026-40345, stack exhaustion from uncontrolled recursion. Only 8.0.0 and
  later are patched, and `@prisma/config` pins 7.1.5 exactly, so the version is
  forced through an override. The release policy refuses an exception for a
  vulnerability that has a fix, which is why this is an upgrade rather than a
  documented acceptance.

- **CVE-2026-14456 in OpenSSL is accepted for this release, expiring
  2026-11-19.** It is a denial of service in OpenSSL's QUIC server, and it is
  unreachable here twice over: PostgreSQL implements no QUIC listener, so the
  code is never executed, and the postgres service publishes no host port, so
  nothing outside the appliance can reach it at all. Debian has released no
  patched package for bookworm and records the issue as minor, so there is
  nothing to upgrade to. The acceptance names the exact image, package and
  identifier, and expires rather than persisting silently.

- **The restricted Status database probe is created again.** Hardening every
  service in this release gave `status-db-init` `cap_drop: [ALL]`, which removes
  DAC_OVERRIDE -- the capability that lets root read a file it does not own. It
  was the last service still taking its secret through Compose `secrets:`, and
  those are bind mounts that keep the host's ownership, so root could `stat`
  the mode-0600 file and not read it: the install stopped at "cannot open
  /run/secrets/status-db-probe-password: Permission denied", after the probe
  role and before anything started.

  It reads the copy `runtime-secrets-init` already materialises for it, as every
  other service does, and the Compose `secrets:` mechanism is gone from the
  appliance rather than corrected in one place.

  It could only ever have failed on a real host. Docker Desktop presents
  bind-mounted files as owned by whoever asks, so a developer machine cannot
  reproduce it, and no install had run this far under the new hardening.

- **Backups run, and Status can see that they did.** The backup loop writes
  into two places it does not own: `./backups`, created by whoever ran the
  installer, and `/signals`, which belongs to the delivery worker's UID so that
  container could stop running as root. It reached both by being root, which
  stopped being enough when this release dropped every capability. It keeps
  DAC_OVERRIDE, and cannot drop root instead, because the owner of those
  destinations is a property of the host rather than anything this appliance
  chooses.

  It also asserted the mode of the signals directory before each write, and
  `chmod` needs FOWNER rather than DAC_OVERRIDE -- so that one line failed for a
  loop that no longer owned the directory, and took the whole backup down with
  it. The mode belongs to the script that sets the ownership; this one now only
  adjusts it while it still owns it.

- **The backup and restore drill waits for a database, not for a ping.** Its
  health check asked `pg_isready` over the Unix socket, and the official
  PostgreSQL image runs a socket-only bootstrap server while it does `initdb` --
  so the check went green against that one, and the drill's next `psql` landed
  in the gap while it shut down to restart: "the database system is shutting
  down". Being a race it failed some runs and not others. It now asks over TCP,
  which the bootstrap server does not accept, and then asks the database to
  answer a query. The CI service container's check was aligned the same way,
  since the job connects to it over TCP.

- **Account email no longer claims to come from the project.**
  `AUTH_EMAIL_FROM` defaulted to `no-reply@lospor.org` in `.env.example`, in
  `generate-secrets.sh` and in Compose. A hospital cannot publish SPF or sign
  DKIM for `lospor.org`, so password-reset mail sent as that address fails
  authentication at the recipient and misattributes who sent it. The installer
  asks for the sender, defaulting to `no-reply@` the site's own clinical domain,
  and Compose has no fallback at all: with no value, nothing sends.


## [1.0.0] - 2026-08-17

The first appliance release. It vendors lospor-api 9.1.1, lospor-app 9.1.1,
lospor-mobile 9.1.1, lospor-core 9.1.1 and lospor-browser 0.5.0, and speaks
exchange contract 2.2.0.

### Clinical recording

- **Yes/no clinical questions record three answers: yes, no, and not asked.**
  They were `Boolean @default(false)` columns, which cannot hold the
  distinction. An untouched field and a recorded "no" both reached the register
  as a documented negative, and a study counting them together is counting
  something it did not measure.

  29 columns are nullable. Both the web form and the phone app ask the question
  as a pair of answers rather than a checkbox or a switch, say so when it has
  not been asked, and let a mis-tap be cleared.

  `emergencySurgery` and `highRiskSurgery` stay binary — not emergent means
  elective. So do the "unobtainable" ticks and the monitoring and equipment
  flags, which are marks a clinician makes rather than questions put to a
  patient. Risk calculators still treat an unasked criterion as absent, so it
  cannot count toward an RCRI, Apfel, STOP-BANG or POVOC score.

- A read-only chart quickview reaches the web-shaped vitals chart from the
  phone mid-case, with its own close control.

### OMOP export

Contract `source_version` 3.8.0.

- Allergies are exported as observations, not as drug administrations. A
  substance a patient reacts to is not one they were given.
- CARE_SITE is its own table, referenced by `care_site_id`, instead of the
  institution being written onto every visit as free text no OHDSI tool reads.
- Continuous administrations carry `drug_exposure_end_date`, paired from their
  stop events. An infusion with no end was indistinguishable from one still
  running.
- Every planned procedure is exported, not only the first, and intraoperative
  drugs resolve their ATC through the same concept pipeline as preoperative
  medications.
- Airway management leaves the appliance for the first time: device list,
  Cormack-Lehane grade, tools, per-device sizes and cuff status, DLT and
  endobronchial detail, ventilation modes, IPPV, jet ventilation and PEEP.
  Placing an instrumented airway is a PROCEDURE_OCCURRENCE — a device is a
  state of the patient, putting it there is something done to them, and only
  the second belongs in a procedure count.
- The preop findings that were read and discarded now leave: smoking,
  substance use, latex allergy, family anaesthesia history, dental state, BMI,
  blood group and Rh, GUTA, and the airway examination.
- MEASUREMENT carries `value_source_value`, `range_low` and `range_high`. A lab
  result with no parsed number used to be skipped entirely, so a culture or a
  blood group left no trace of having been recorded.
- Vascular lines carry depth, lumen count and whether they were already in
  place — a pre-existing line was not placed during this case.
- Concept mappings distinguish `MANUALLY_CURATED` from an automatic match and
  `REJECTED` from "nobody has looked yet". A rejected mapping keeps its row so
  the rejection is remembered, but never applies its concept id.

### Installation

- **The clinical HTTPS port and the Status port are configurable**, with
  `HOSPITAL_HTTPS_PORT` and `HOSPITAL_STATUS_PORT` in `.env`. They default to
  443 and 3443; a server that already uses either can move it instead of being
  unable to install at all. The readiness report checks the configured ports,
  because it runs before the install and checking the defaults would test a
  port nobody is going to use.

- **Port 80 is deliberately not configurable.** Certificates are issued over
  the ACME HTTP-01 challenge, which Let's Encrypt always validates on port 80
  of the public name. An appliance moved off it would install cleanly and stop
  renewing ninety days later. A host that cannot free port 80 needs the
  appliance behind a reverse proxy the hospital already operates — a different
  deployment shape rather than a different port.

- The Status page stays bound to loopback at any port. Only the number is
  configurable; publishing the outage page to a LAN is a security regression.

### Exchange with Central

- **The appliance checks its own OMOP columns against the contract.** The
  contract declares the column set both products implement, and until now only
  Central held itself against it — drift was detectable on receipt and nowhere
  else. A column the appliance emitted and the contract did not declare reached
  Central and was dropped, with correct row counts and no warning; a column
  declared and never emitted left a field every study would find empty without
  learning why.

  Both ends now check their own half. Contract 2.1.0 to 2.2.0, which adds
  nothing to the wire, so a 2.1.0 Central still accepts this appliance batches.

### Local to the appliance

- `identityByCase` links a patient's repeat operations across cases. The
  serverless export has no such linkage and says so in its own provenance.
- No telemetry leaves the hospital network: the vendored web app carries no
  Sentry and no Vercel analytics.

### Database

Two migrations, applied on start:

- `20260816160000_tristate_clinical_questions`
- `20260816180000_concept_mapping_provenance`

Both are additive or relaxing. **Existing rows are deliberately left as they
are**: rewriting them to NULL would discard the genuine "no" answers among
them, and a hospital that has already collected cases cannot recover that
distinction afterwards.
