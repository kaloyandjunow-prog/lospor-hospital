# Changelog - LOSPOR Hospital

## [Unreleased] - 1.4.0

Installation and updates no longer need any GitHub or registry credential. The
repository, its releases and the ten GHCR images are public; what a site trusts
is still only the Ed25519 signature over the release lock.

1.4.0 is a fresh-install release: no hospital runs an earlier version, so there
is no upgrade path from 1.3.x.

### Added

- **A first installation with nothing to type.** `losporctl-install.sh`
  replaces the 54-line verification block, the release-lock digest and the
  signing-key fingerprint an operator had to type. It carries the maintainer's
  release signing public key and, online, requires it to match the fingerprint
  published at `lospor.org/.well-known/lospor-release-key.txt`. The Cloudflare
  channel is independent of GitHub, and an unreachable or different fingerprint
  stops the install before any download. Offline, the maintainer's USB is the
  second channel. The script verifies the signature, the sidecar, the
  deployment archive and every archive entry, and refuses an existing
  installation. It replaces a bootstrap left by an interrupted attempt, pins the
  key, and starts the guided installer.
- The guided installer skips the digest prompt when a key is already pinned,
  verifying the lock's signature instead.
- **Installed vs. ready for clinical use.** A Status **Go-live** page combines
  what the appliance already observes into one checklist and one verdict:
  certificate, services, clock, backups, off-host copy, escrowed secrets,
  update route, and active terminology. It adds five sign-offs only a person can
  make: a restore drill (valid 92 days), network verification, stored MFA
  recovery codes, host patch policy, and clinical acceptance. Signing or
  withdrawing needs the administrator password and a note, and is logged with a
  pseudonymous operator reference. The verdict is recomputed on every view, and
  shows maintenance or recovery-required when a restore, terminology operation
  or interrupted activation is in the way. Installation now ends by saying the
  appliance is not yet approved and pointing to this page, instead of printing
  "Installation complete" twice.
- **Thirteen installer answers instead of twenty-six.** Guidance, external AI
  and its key, the support contact, e-mail sender, country, administrator
  contact e-mail and off-host hook are no longer asked. Each takes the safe
  default it always offered, and the AI key is added in Status, where it is
  sealed. The certificate-notice e-mail is asked only for a public certificate.
- **One file for hospital IT, with a preview and an automatic undo.** The
  59-line `.env` is split by owner:
  - `site.env` holds the eighteen settings a hospital changes: names,
    certificate mode, network lists, ports, sender, support contact and update
    window;
  - the root-only `secrets/appliance.env` holds everything generated;
  - `.env` is compiled from both and marked as generated.

  A secret typed into `site.env`, a site setting hidden among the secrets, a
  duplicate, or a stored Compose profile is refused before anything changes.
  `apply-site-config.sh --plan` validates every value, checks the result with
  Compose, and lists only what changes, never a secret. `--yes` keeps the
  running configuration, restarts only the services that need it, waits for
  them, and runs doctor. If doctor fails, it restores the previous
  configuration, keeps the rejected edit for review, and reports recovery
  required only if the restored configuration is unhealthy too. Existing
  appliances are split on first use, and a `site.env` missing after a rebuild
  from escrow is recovered from `.env`. `site.env.example` documents every
  setting.

### Changed

- **Verifying loaded images takes seconds instead of minutes.** Each check read
  every image back out with `docker image save` to find a few kilobytes of
  configuration; the 1.3.2 baseline install spent 311 of its 455 seconds doing
  that twice. The configuration digest is now read from the daemon's own store
  and bound to the tag: the image ID on the classic store, and a hash-checked
  descriptor → manifest (through an index when present) → configuration chain on
  the containerd store. The same check on the test VM went from 158 s to 2 s.
- **No credentials for connected installation or updates.**
  `provision-update-credentials.sh` and the `secrets/registry/` files are gone.
  Release metadata and assets are fetched anonymously, and images are pulled
  into an empty throwaway Docker configuration, so a pull can never silently
  depend on a login stored on the host. When GitHub's anonymous per-address
  allowance is spent, preparation reports `UPDATE_RELEASE_RATE_LIMITED` and the
  time to retry instead of a generic fetch failure.
- **Host observability signal v2.** `host-observability.v2.json` drops the two
  credential fields. Status replaces "Update supply credentials" with "Update
  supply route", showing connected and offline as valid routes and an unknown
  mode as an outage.
- The CI online-installation proofs now install with no registry credential,
  and the workflow contract refuses one being added back.

### Fixed

- **Documented appliance commands could not run as printed.** Tried on an
  installed appliance as the documentation shows them:
  - `./scripts/doctor.sh` and `./scripts/appliance-operator.sh` failed on
    root-owned state with a misleading message;
  - `terminology-status.sh` and `rotate-operational-secrets.sh`, shown as
    `./scripts/…`, have no executable bit.

  Every operator command in the installation, operations, backup,
  network, secret-rotation, Status, terminology and update documents (both
  languages) now reads `sudo sh /opt/lospor-hospital/current/scripts/<name>.sh`.
  `docs-commands.test.mjs` holds every shell block to that form, checks that
  each named script exists, and checks that the Bulgarian and English documents
  give the same commands.
- **Operational secret rotation failed on every installed appliance.** It
  worked from the release directory, where `.env` is a symlink into the
  appliance home, so its protected-file check refused it. Past that check it
  would have taken the maintenance lock at `.data/runtime/io-mutation.lock`
  instead of the `.data/io-mutation.lock` that backup, install and update hold.
  Its tests only ever ran in a source checkout. Rotation now resolves the
  appliance home through the release's `.lospor-home` link for `.env`, secrets,
  its audit trail and the shared lock. A new test builds the installed-release
  layout and fails against the old code with the error the appliance showed.
- **Image verification accepted a changed configuration on the containerd
  image store.** `docker image save` omits the configuration blob there, so the
  check fell back to fetching a blob named by the digest the lock *expected*.
  Any such blob still in the content store matched, so a tag re-pointed at an
  image with identical layers but a different entrypoint, environment or user
  passed verification. Reproduced on Docker 29 with the 1.3.2 images. The check
  now follows only digests the tag itself leads to, and refuses on any gap.
- **The host monitoring check rejected every real signal.** The probe gained
  `keyEscrow` but `check-host-observability.py` never learned it, so on a real
  appliance the check always reported `HOST_OBSERVABILITY_INVALID` instead of
  host health. Both suites stayed green because each used its own fixture. The
  check now grades key escrow the way Status does, and the probe test feeds the
  probe's own output to the check.

## [1.3.3] - 2026-09-12

Three faults that stood between a verified release and a working first
installation, all of them only reachable by installing the way an ordinary
operator would. Nothing upstream changed: the vendored API, Web, PWA, Browser
and Core are the same reviewed versions 1.3.2 shipped.

### Fixed

- **The documented installation could not succeed as written.** Every launcher
  invocation in the installation and update documentation was shown without
  `sudo`, but an installation ends by writing and starting the appliance's
  systemd units, and `install-update-agent.sh` and `install-host-observability.sh`
  refuse to run as anyone but root. Followed literally, the install did not fail
  at the end with a clear message about privilege; it stopped partway on
  whichever root-owned path it reached first — the GHCR credentials it could not
  read, or the signing key it could not store — and reported that path instead.
  Every documented launcher is now shown with `sudo`, in both languages, with
  the reason stated once where the first installation is described. The same
  correction is carried into the serverless `self-hosting` page, which showed
  `./scripts/install.sh` bare.

- **Status rejected its whole control plane over a missing email.** Research
  accounts, grants and OMOP export requests each required a non-empty email
  string, and the view parser is all-or-nothing, so a single principal without
  one made `parseView` reject the entire payload. Hospital principals sign in
  with a username and their contact email is explicitly optional, so this was
  the ordinary case, not an edge one — and the rejected payload carries Central
  enrolment, transport configuration and certificates as well as research, which
  is why an appliance with an email-less administrator could not be configured
  for communication at all. Email is nullable end to end now: type, parser and
  rendering, with the address simply omitted where there is none.

- **A first installation stopped at the signing key and told the operator their
  release might be tampered with.** `provision-update-credentials.sh` claimed the
  shared `secrets/` parent for root at mode 0700, not just its own
  `secrets/registry`. The documented online order runs it as root and then runs
  `install-guided.sh` as the ordinary install user, which pins the release
  signing public key into that same shared directory — so the pin failed with a
  bare permission error. `pin-release-signing-key.sh` left with status 1 for
  that write failure, the same status it uses to refuse a key that does not
  match its fingerprint, and `install-guided.sh` reported every non-zero status
  as a mismatch. The operator saw "THE SIGNING KEY DOES NOT MATCH THE
  FINGERPRINT YOU ENTERED", with two identical fingerprints printed beneath it,
  and was told to stop and suspect the download. Credential provisioning now
  locks only `secrets/registry`, which is what actually protects a credential;
  an unwritable key store now exits 5 and says the fingerprint matched and the
  fault is local; and the installer only claims a mismatch for the status that
  means one. Covered by new cases in `release-signing.test.sh` and
  `provision-update-credentials.test.sh`, both of which fail against the prior
  behaviour. Only reachable as a non-root operator, which is why earlier
  all-as-root testing never saw it.

## [1.3.2] - 2026-09-09

### Fixed

- Isolated the insecure clinician-support URL guided-installer test from the
  successful installation immediately before it, so the Linux appliance gate
  cannot inherit a generated `.env` and bypass its first-install assertion.
- Updated Next.js to 16.3.3, Sharp to 0.35.4, and transitive js-yaml to 4.3.2
  across the affected applications for the critical/high advisories published
  in GitHub's advisory feed on 2026-09-08.
- Migrated the three affected Web internal navigations to Next's router so the
  upgraded strict release lint remains warning-free.
- Supplied the API image's builder-only typecheck with the Status event parser
  used by its cross-service contract test, without adding Status source to the
  deployed API image.
- Supplied the Web image's builder-only typecheck with the root upstream
  provenance manifest used by its client-version contract test, without adding
  that manifest to the deployed Web image.
- Recorded explicit, expiring 1.3.2 risk acceptances for all three HIGH CVE
  findings in the ten candidate images. The two Debian systemd-library
  findings remain scoped to PostgreSQL, and the newly reported grpc finding is
  scoped to the source-built Caddy image. The exceptional allowance for that
  fixable HIGH is restricted to 1.3.2; unlisted findings and every later
  release remain fail-closed, and CRITICAL findings cannot be excepted.

- A first installation no longer rejects an optional blank clinical contact
  email. Status and the clinical database now reconcile the appliance operator
  through their existing monotonic credential generation; contact email is
  neither login identity nor cross-store state.
- The update-agent installer accepts its canonical loop as the readable shell
  program that systemd invokes through `/bin/sh`, instead of requiring an
  executable bit the release archive does not carry.
- Guided offline installation now defaults future update supply to offline
  before readiness runs, while preserving an explicit independent update
  supply choice.
- Guided installation resolves the pinned signing key and final `.env`
  through the canonical appliance home, preventing a repeated fingerprint
  prompt and malformed `https:///` completion links after activation.
- The Status Updates page now retains the installed appliance version when no
  update-agent signal exists, including deliberate console-only operation.
- Bulgarian Status now translates automatic case closure and installation
  secrets escrow component names.
- Caddy's deliberately short-lived local-test leaf certificates no longer
  trigger the public/operator 30-day expiry incident; actual expiry remains a
  failure.
- PWA animations retain the native driver on iOS and Android but disable it on
  web, removing React Native Web's unsupported-driver warning.
- Node-based appliance image builds now retry transient npm registry fetches
  with bounded backoff instead of abandoning an otherwise valid candidate on
  the first short network interruption.

### Tests

- Added generation-only operator-state contracts, installer update-supply
  coverage, canonical completion fixtures, update-loop readability assertions,
  Status version fallback tests, Bulgarian component rendering tests, local
  certificate policy coverage, and a PWA web animation-driver boundary test.
- Added a synthetic Central contract guard that keeps recoverable checkpoint
  disagreements explicitly retryable.

## [1.3.1] - 2026-09-08

### Fixed

- **A genuine first installation could never complete.** `scripts/host-observability-probe.sh`
  and `scripts/install-update-agent.sh` were committed without their executable bit, which
  `git archive` (and therefore every deployment archive built from it, 1.3.0 included) packages
  faithfully. `install-host-observability.sh` and `install-update-agent.sh` each refuse to install
  their systemd unit unless the release's own copy of the script they manage is executable, so
  every real first install — online or offline — failed at the very last step of activation, well
  after every container was healthy and the database was fully migrated and seeded, and was then
  correctly and safely rolled back. An update onto an already-installed appliance was unaffected,
  because `current` already pointed at a working prior release throughout. Both files are now
  committed executable, and `scripts/script-executable-bits.test.sh` (wired into
  `test:installer-contracts`) checks their committed git mode directly so this cannot silently
  regress again.

## [1.3.0] - 2026-09-08

Imports core 9.9.2 and api/web/pwa 9.9.5, and closes the gap that made
automatic case closure an appliance-only feature in fact as well as in name.

### Added

- **Automatic case closure now runs here.** The route has existed all along and
  the hosted deployment ran it from Vercel Cron, which a hospital box does not
  have — so nothing on an appliance ever called it. A case closed only if a
  clinician happened to have it open when its thirty-minute review window ran
  out, and one nobody returned to stayed open indefinitely. The delivery worker
  now calls `/v1/internal/close-expired-cases` every five minutes on its own
  clock (`HOSPITAL_CASE_CLOSE_INTERVAL_SECONDS`, default 300), the same shape
  retention uses and for the same reason: a thirty-minute window wants a cadence
  in minutes, not the daily one and not the sixty-second delivery one.

  Upstream deliberately no longer schedules it at all — Vercel charges for
  sub-daily cron schedules and rejects the whole deployment without them, which
  had frozen the published API at 9.8.0 for four releases — so reading
  lospor-api now suggests the feature is unscheduled everywhere. The
  `delivery.case-close-sweep-scheduled` overlay rule exists so that impression
  cannot quietly become true here: a vendor pass that drops the call, or a
  tidy-up that removes it as dead because upstream has no equivalent, fails the
  gate instead of shipping an appliance where finished cases never close.

- **A Status component for it.** *Automatic case closure* reads as an outage
  when no sweep has succeeded for an hour — against a thirty-minute window a
  sweep that last ran an hour ago is already failing at its job — and as
  unknown, never as healthy, when none has ever been recorded. The way the
  original defect survived is that nothing observed it.

### Fixed

- **Five administrative actions did not work at all.** The audit privacy guard
  rejects any detail key ending in `reason`, and the transactional audit writer
  runs inside the caller's transaction — so passing an operator's justification
  rolled the whole act back with it. Suspending an account, reactivating it,
  restoring it, changing an administrator's authority and selecting an
  institution's clinical ruleset all failed silently. Two further records, the
  PII block and the maintenance seed refusal, used the non-throwing writer and
  so were discarded rather than breaking the request.

- **A crashed delivery worker stranded an EHR message permanently.** Claiming
  set the status to SENDING while the next claim looked only for PENDING, so the
  lease expiry the design relied on could never apply. Expired leases are now
  reclaimed, and completing a delivery requires the worker that holds the lease
  so a returning worker cannot finish one somebody else has taken over.

- **A refusal could cross the New Year onto a different patient.** ИЗ № restarts
  each January, so last year's number and this year's are different admissions,
  but the rejection history spanned both — silently withholding an item from a
  clinician who had never seen it. Year-scoped identifiers now consult only
  their own scope; ЕГН, which is issued once for life, still spans.

- **Heads of department could not scan a colleague's case.** The lab-image and
  monitor-scan routes read the owner's institution but not the case's own, which
  is the field the access check actually compares.

- **The web app acknowledged an offline save before it was committed.** Browser
  storage resolved when the write request succeeded rather than when its
  transaction committed, so a transaction that failed at commit left the
  clinician told their edit was stored.

### Added

- **A governed home for administrative explanations.** Six acts require a
  written justification and none of them kept it. The audit trail is the wrong
  place — it deliberately refuses operator free text — so the explanation is now
  stored alongside it and the audit row records that one exists.


- **The review countdown could start on a case that could never be closed.**
  Submitting for review gated on the recovery score and disposition alone,
  while finalization requires the five preoperative sections, an intraoperative
  record with both times and a technique, and the postop. A case with a
  four-field preop and no intraoperative record at all could enter
  `AWAITING_REVIEW` and promise a closure that could not happen.

- **Those cases then wedged closure for everyone.** The sweep takes the
  twenty-five oldest cases awaiting review, oldest first, and a refused case
  kept its timestamp — so it was re-selected on every run for ever. Twenty-five
  of them at the head of the queue meant the twenty-sixth was never examined:
  one ward's unfinished paperwork could stop automatic closure for the whole
  hospital, silently. A refusal now defers the case with a growing backoff,
  capped at a day, cleared when it is resubmitted.

- **A failed submission looked exactly like a successful one** on both the web
  and phone clients, which advanced to a summary saying the case was finished
  while it sat in `IN_PROGRESS` with no countdown running.

- **A case inside its closure window was labelled "Awaiting postop"** on the web
  dashboard — the state it had just left, on the one status that is
  time-critical — and the phone's *Awaiting Postop* tab counted cases the list
  beneath it did not show.

- **Allocation readiness had two definitions that disagreed in both
  directions**, so the same case read as ready to schedule on one client and
  not the other. There is one now, in core.

- **The runtime secrets contract test pinned the previous secret list
  verbatim**, so `ehr-transport-seal-key` joining it read as a regression rather
  than the deliberate addition it was.

- **The PWA served with no Content-Security-Policy at all.** `infra/nginx/pwa.conf`
  never set one; nothing else on the appliance did either, since Caddy only adds
  a narrow `frame-ancestors` on top of what the upstream service sends. This
  branch never having been vendored through CI before is what surfaced it: the
  suite that tests the deployed policy could not even start, because the script
  serving it for that suite read a `vercel.json` this appliance correctly does
  not have. Both the production config and the test harness now carry the same
  policy `lospor-mobile` currently deploys, so they cannot drift from each other
  again.

- **The privacy page could have started naming Supabase and Vercel as
  sub-processors on a hospital's own installation.** Found while sweeping for
  more of the defect above: the appliance's page is a complete rewrite —
  institution as controller, data kept on the local server — but nothing
  protected that rewrite from being replaced by upstream's one-line component
  on a future vendor pass. It is guarded now.

## [1.2.3] - 2026-08-31

Findings from exercising the published 1.2.1 and 1.2.2 releases end to end on a
real host: an online first install, a registry-independent offline first
install, a genuine 1.2.1 to 1.2.2 update, and a forced activation failure.
This release also imports lospor-api 9.5.0, which carries a redaction defect
fix that affects research exports whether or not external AI is ever enabled.

### Fixed

- **Lab report scanning would have been broken in this release, and consent for
  it was never actually checked.** The first candidate vendored `apps/api` at
  9.5.0, which had made per-case AI consent a required *request field*, while
  the web and phone clients stayed at 9.4.0 and went on sending the old body —
  so every scan would have returned 403. Every gate passed, because nothing
  compared the three vendored versions to each other and the AI routes cannot
  run in CI without a provider credential.

  Fixing the clients to send the flag would have restored the feature and left
  the deeper problem: the server was taking the caller's word for consent, so
  any authenticated caller could assert consent the clinical record did not
  contain. This route sends a photograph of a lab printout, which carries the
  patient's name and EGN in its header and cannot be redacted.

  Upstream 9.6.0 moves the route under the case — `POST
  /v1/cases/{id}/ai/read-labs` — where the server reads `preop.aiOptIn` from
  the record and ignores anything the client claims, exactly as the monitor
  scanner has always done. Both image routes now match. A report cannot be
  scanned into a case that does not exist yet: the client saves first, which is
  the only honest order, since an unsaved draft has no recorded consent to read.
  The appliance keeps its sealed-policy gate in front of all this, so deployment
  permission and per-case consent remain two separate keys.

- **Bulgarian clinical text was being removed from OMOP research exports.** The
  free-text redactor's name pattern carried the explicit range `Ѐ-ӿ` in its
  uppercase-first-letter position. That range is the whole Cyrillic block,
  lowercase а-я included, so any two adjacent Cyrillic words matched the
  two-names pattern and were replaced wholesale: `остър апендицит` left as
  `[REDACTED]`, while the equivalent lowercase Latin text was untouched. The
  pattern now uses the Unicode `\p{Lu}` property, which already covers Cyrillic
  capitals correctly.

  This was not confined to the AI features. `redactExportRow` is called on three
  of its four export paths with no options, and free text is included by
  default, so an ordinarily configured appliance corrupted its own research
  exports with external AI switched off and no credential installed. Coded
  vocabulary fields -- diagnosis, planned procedure, allergy detail, current
  medications, drug names and event labels -- now skip the two-capitalised-words
  guess entirely, which cannot distinguish a disease from a patient. Every
  structural check is retained: EGN, long numbers, dates and email addresses are
  redacted as before, and genuine clinician prose keeps the name guess on.

- **The two image-scanning AI routes could be used on a case whose AI opt-in was
  unticked, and recorded nothing when they succeeded.** Both send a photograph
  -- a laboratory report or a monitor screen -- to an external provider. No text
  redaction is possible on an image and none is attempted, so they are the
  highest-exposure AI actions in the product, yet they were reachable without
  the per-case consent that gates the advice routes, while the consent text
  beside that tickbox promises no names or free text ever leave. The monitor
  scanner now reads consent from the database and ignores any client-supplied
  value, the laboratory scanner requires it in the request, and both write an
  audit row on success. Consent is checked after the size guard, so an oversized
  image is still rejected as oversized rather than reported as a consent
  problem. Deployment permission and per-case consent remain separate questions:
  the sealed-credential policy continues to decide whether this appliance may
  reach a provider at all.

- **A rejected AI request pushed its own rate-limit window forward.** The burst
  check recorded a timestamp unconditionally, so a client retrying faster than
  the cooldown refreshed the very timestamp it was being measured against and
  could never escape. Only a request that is actually served now starts a new
  cooldown.

- **The monitor scanner returned whatever the model wrote in a numeric field.**
  Plausibility bounds only nulled values that were numerically out of range, and
  a non-number fails every comparison silently, so `{"systolic": "not visible"}`
  was neither below 20 nor above 300 and reached the client as a string in a
  vitals field. Anything that is not a finite number is now discarded. The route
  also gained the request timeout the other two AI routes always had, and its
  vision model is pinned rather than floating on `-latest`.

- **Backup manifests could claim a release the appliance was not running.** The
  backup service and `infra/postgres/backup-once.sh` pinned version literals at
  `1.2.1` while the repository shipped 1.2.2, and those values are written into
  every backup manifest as `toolVersion` and `hospitalRelease`. A service
  started without the launcher exporting `HOSPITAL_RELEASE` therefore stamped a
  wrong version into provenance metadata nobody re-reads until an audit or a
  restore. They now fall back to `source`, matching what the rest of the tree
  already uses to mean "not a published release".

- **`doctor.sh` reported that no database backup existed, on every appliance,
  however many verified backups it held.** Inside a release root `backups` is a
  symlink to the appliance home's directory, created by
  `activate-verified-release.sh`, and the discovery used `find backups`, which
  does not follow a symlinked starting point. Three consequences, all observed
  on a live appliance holding real backups: the operator was told
  `Warning: no completed database backup exists yet.` indefinitely;
  `backup_verify_object` never ran at all, so doctor's authenticated
  verification of the newest recovery object was dead code in production and a
  corrupt backup could not have been detected by it; and the reassurance line
  naming the verified local copy never printed, leaving the bare off-host
  `CRITICAL` — precisely the reading the comment beside it exists to prevent,
  since an operator sees "no backup acknowledged" and goes hunting for a broken
  backup that is in fact complete. The search now follows the symlink. Verified
  against a running appliance: the same appliance that reported no backup now
  reports `Latest authenticated recovery object verified` and
  `The local backup is complete and verified (<timestamp>)`, and the
  verification container genuinely runs.

### Changed

- **The vendored API, web app and phone app must now be the same upstream
  version.** They are released upstream as one set and share request contracts,
  so vendoring one without the others is how this release nearly shipped a
  broken lab scanner. `verify:version-defaults` compares the three pins and
  fails if they diverge; core is deliberately excluded, because it has its own
  cadence and `verify:upstream` already ties it down from the other side by
  requiring every app lock to record the vendored core's version.

- **Version metadata that is stamped into provenance can no longer drift
  silently.** `verify:version-defaults` runs inside `verify:provenance`, so it
  reaches CI and the local mirror. The appliance release and backup tool version
  must never carry a semver literal, and the exchange contract and data
  dictionary versions must equal the version recorded in
  `UPSTREAM_VERSIONS.json` -- so bumping the contract without updating Compose
  now fails a gate instead of a hospital's backup manifest. The host-side path
  already resolved these correctly from `package.json`, which is why the Compose
  defaults were easy to miss.

- **Every pinned external action now runs on Node 24.** `docker/login-action`
  (v3.7.0) and `docker/setup-buildx-action` (v3.12.0) were the last two on the
  deprecated Node 20 runtime and the exact source of the recurring CI
  deprecation warning; both were bumped to their current v4 releases, whose
  `action.yml` declares `using: 'node24'`. Pins remain full 40-character commit
  SHAs with readable version comments, as `assertPinnedExternalActions`
  requires. `actions/checkout`, `actions/setup-node` and
  `actions/upload-artifact` were already on Node 24 and are unchanged. Cosmetic
  today, blocking whenever GitHub retires the Node 20 runner.

### Testing

- **`scripts/doctor-restore-preopen.test.sh` was never executed by anything.**
  It was referenced by no npm script, no workflow and no other script, so
  `doctor.sh` — the health gate for applying a release *and* for verifying a
  rollback afterwards — had no automated coverage at all. That is why the
  backup-discovery defect above shipped unnoticed. It is now wired into
  `test:installer-contracts`, which CI runs, and it passes unchanged.
- Added `scripts/doctor-backup-discovery.test.sh`, which reproduces the real
  symlink layout, asserts that a symlinked backups directory is genuinely
  invisible to `find` without `-L` (so the guarantee being protected stays
  explicit), and binds the discovery expression in `doctor.sh` to that
  guarantee.
- **Five more test files were reachable from nothing at all** — no npm script,
  no workflow, no other script. All five pass; they were simply never wired in,
  so everything they cover was unverified on every commit. Now registered in
  the suites CI already runs:
  - `scripts/update-pipeline-e2e.test.mjs` (18 assertions, the most serious
    gap) drives the shipped `prepare-verified-release.sh` and
    `apply-prepared-release.sh` against a synthesized publication. It is the
    only thing that proves a **forged release stops before the appliance has
    changed** — a lock swapped after publication, a lock tampered with after
    signing, a signature from an untrusted key, a mutable tag substituted for a
    pinned digest, and a downgrade below the installed release — plus that an
    apply refuses stale or mismatched prepared state and refuses to start while
    an activation lock or a running backup owns the appliance. Its own header
    notes that neither the contract test nor the stubbed agent test can answer
    these questions. Added to `test:update-pipeline`.
  - `scripts/tls-certificate-check.test.sh` (6) — CA rejection, client-only EKU
    rejection, and the 30-day validity floor. Added to
    `test:installer-contracts`.
  - `scripts/network-boundaries.test.py` (4) — added to
    `test:installer-contracts`.
  - `scripts/terminology-db-lib.test.sh` — added to `test:terminology-status`.
  - `scripts/inspect-release-assets.test.mjs` — added to
    `test:release-artifacts`.

  `apps/web/scripts/crossapp-ci-contract.test.mjs` is deliberately *not*
  registered here: it is vendored from `lospor-app`, resolves a workflow path
  relative to that repository root, and is already run and passing upstream via
  `check:crossapp-ci`.

## [1.2.2] - 2026-08-29

Findings from the first real 1.2.1 installation and a cross-repository audit.
Every item was re-verified against the code before being acted on; three audit
findings did not survive that check and two described working, deliberate
behaviour, so they are recorded here as rejected rather than silently fixed.

### Fixed

- **A clinician correcting a pediatric case to adult could be trapped in a
  permanent "saved locally" draft while the server was reachable.** Selecting
  Adult cleared the pediatric `ageValue`/`ageUnit` with `undefined`, which is
  dropped from the patch entirely rather than sent as a clear. The server
  therefore kept the precise pediatric age it already held, that age continued
  to outrank the submitted adult age, and it refused the write with
  `PEDIATRIC_MODE_REQUIRED` every time. The outbox could not recover: its
  conflict-retry path only self-heals when the server supplies a fresh revision,
  which a domain refusal does not carry, so the patch was re-stored and the
  autosave manager relabelled the deterministic rejection as "queued — waiting
  for connection". The clear is now an explicit null that reaches the server,
  the age fields accept null so that clear cannot be coerced into age 0, and
  `PEDIATRIC_MODE_REQUIRED`, `ADULT_MODE_REQUIRED`, `PEDIATRIC_AGE_REQUIRED`
  and `INVALID_PEDIATRIC_AGE` are now visible validation blockers that are
  never replayed or described as an offline save. Availability gates
  (`PEDIATRIC_MODE_DISABLED`, `PEDIATRIC_CLIENT_UPDATE_REQUIRED`) stay
  retryable, because they stop being true without the clinician changing
  anything. The under-18 boundary itself is unchanged: a genuine 13-year-old
  still cannot be recorded as adult. Web and PWA alike, and the mode action now
  names where it will take you instead of reading as an offer to override the
  warning it sits beside.

- **These refusals no longer tell a clinician that the patient's age contains
  identifying information.** Both clients routed any unrecognised blocked-save
  reason through the personal-data wording.

- **The clinical address is usable on a phone again.** With the web app and the
  PWA on one hostname, a phone opening the clinical root was redirected to the
  clinical root: the redirect was built from the configured PWA origin alone
  and discarded its `/app` path, so the browser bounced until it gave up. The
  configured path is now preserved, `/cases` and `/dashboard` serve the
  responsive web app on a phone rather than being redirect targets at all, and
  a redirect whose destination equals the incoming URL is refused outright, so
  this class of loop cannot be reintroduced by configuration.

- **A rejected administrator password during installation now says so.** The
  credential pipeline validated mid-pipe, and a shell pipeline reports only its
  last command's status — the supported host's `/bin/sh` is dash, which has no
  `pipefail`. A password refused by the policy check therefore did not stop the
  install on its own account: the run continued and failed later on truncated
  input, and that unrelated downstream error was what the operator had to
  diagnose.

- **Doctor no longer reads as though a completed backup had failed.** The local
  backup was verified correctly; the CRITICAL beneath it is about off-host
  replication and always was. It now states the verified local backup and its
  timestamp first, then what is actually missing. The go-live gate is unchanged
  — a copy that exists only on the appliance does not survive the appliance.

- **Offline hospitals get the same guided installation as connected ones.** The
  guided installer always finished through the connected launcher, so a site
  with no network was documented straight into the lower-level offline script
  and never saw the Bulgarian-first welcome, digest confirmation, signing-key
  pinning or readiness report. It now asks where the images should come from,
  defaults to whatever the media supports without ever choosing silently, and
  fails closed either way rather than falling back to a source the operator did
  not agree to. Both launchers already verified the same lock digest and
  signature before either was chosen; that is unchanged.

- **Operator documentation no longer prints commands that cannot run.**
  `rotate-operational-secrets.sh`, `sign-release-lock.sh` and `test-install.sh`
  were shown as `./script.sh` while carrying mode 0644.

### Changed

- **Status has one persistent header across all five administrator pages.**
  Navigation was previously a paragraph of links at the bottom of the dashboard
  plus a lone "Back to status" on each child page, and every page rebuilt its
  own brand, language switcher and sign-out. Destinations now come from a single
  registry that also decides which of them a console recovery session is
  offered — it is shown only what it can actually open, rather than links that
  would certainly refuse it. Hiding a link remains navigation, not
  authorization: every route still enforces its own check. The header is
  server-rendered with no client JavaScript and no change to the strict CSP,
  and a contract test now fails if a new authenticated page is added without an
  explicit decision about whether it belongs there.

### Documentation

- The release-validation guide described the completed client-localization
  import as still pending and Hospital 1.2 publication as blocked; it now
  states the ready-state contract and what a future pin change must re-prove.
- The account-provisioning guide described already-applied identity, legal and
  username migrations as staged future work, and instructed engineering to stop
  writing `User.approvedAt` — the opposite of the actual contract, in which the
  Hospital overlay deliberately restores that column after the shared migration
  drops it, because this deployment has no email-verification gate.
- The public Getting Started guide said institution was optional at
  registration, where it is required.
- The PostgreSQL integration-test README listed four suites; ten exist, two of
  them behind a second flag.
- Both corrections are mirrored in the Bulgarian companions.

### Rejected after verification

- **Central withdrawal authority follows the clinician who finalized a case,
  not its creator.** Reported as a defect; it is deliberate, documented in the
  code, and asserted by a test titled "the clinician who finalised a case holds
  its Central authority, its creator does not". Withdrawing retracts an
  attestation, so it belongs to whoever made it.
- **Medication dose guidance prose is intended.** Its removal was reported as
  outstanding; a regression test requires it to remain visible.
- **Doctor's backup verification and the operator scripts' file modes are
  correct as they stand**; only the wording and the documented commands needed
  changing, above.

## [1.2.1] - 2026-08-28

### Fixed

- **The publication proof now uses the same appliance privilege boundary as the
  successful candidate proof.** Version 1.2.0 was deliberately left
  unpublished after the publication runner invoked the clean-install harness
  without sudo -E: services started, but the installer could not write its
  root-owned update-agent installation state and rollback then emitted a
  secondary missing-configuration error. Both connected and offline
  publication proofs now run the installer harness as root, and the workflow
  contract rejects either path if that requirement is removed. The immutable
  hospital-1.2.0 tag remains historical; this corrected train starts at
  hospital-1.2.1.

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

- **The Hospital E2E database now seeds valid 1.2.1 research authority.** The
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
  complete contract. WAL/PITR remains explicitly outside 1.2.1.

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
