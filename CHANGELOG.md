# Changelog - LOSPOR Hospital

## [1.1.0] - 2026-08-18

Vendors the same lospor-api, lospor-app, lospor-mobile and lospor-core 9.1.1 as
1.0.0, and speaks exchange contract 2.2.0. No clinical behaviour changes.

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
