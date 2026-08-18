# Changelog - LOSPOR Hospital

## [1.1.0] - 2026-08-18

Vendors lospor-api, lospor-app, lospor-mobile and lospor-core 9.2.0, and speaks
exchange contract 2.2.0.

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
