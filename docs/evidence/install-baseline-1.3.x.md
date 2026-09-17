# Install baseline: Hospital 1.3.2, offline, as documented in 1.3.3

Recorded 13 September 2026 on the test VM, for the 1.4.0 install-simplification
plan (workstream W0). Every later install change is measured against these
numbers.

## Setup

| Item | Value |
|---|---|
| Host | Hyper-V VM "LOSPOR Test Machine", Ubuntu 24.04.4 LTS, Docker already installed |
| Starting state | Previous 1.3.2 install removed: 5 `lospor-*` systemd units, `/etc/lospor-hospital`, all `lospor-hospital` containers, volumes, networks and release images, and `/opt/lospor-hospital`. Checkpoint `pre-1.4.0-baseline 1.3.2-installed 2026-09-13` taken first. |
| Release | `hospital-1.3.2`, immutable GitHub release, lock `c8632cf89e800079bde26b9118e10dc276bee9f1a4f82265cb76903f11868509` |
| Procedure | `docs/release-validation.md` at tag `hospital-1.3.3`, section "Client verification and installation", offline route |
| Names / TLS | `hospital.lospor.local`, `research.lospor.local` in `/etc/hosts`; `local` TLS |
| Operator input | Scripted: the documented verification block with its three values filled in, then answers on standard input to the guided installer (plain-prompt mode) |

Not measured: Ubuntu and Docker installation (the VM already had them), and the
time a person spends reading documentation, typing, or fixing typos.

## Timeline

| Phase | Elapsed | Notes |
|---|---|---|
| Download release assets (883 MB, 7 files) | 107 s | From the public GitHub release; stands in for copying to USB |
| A. Documented verification block | 1.7 s | 54 lines of shell typed by the operator; passed first time |
| B1. Guided questions + pre-install readiness | < 1 s machine | 26 answers; readiness 0 failures, 4 warnings |
| B2. Load 10 images from media | 1–47 s | `docker load` of one 872 MB part |
| B3. Verify loaded images against the lock (1st pass) | 47–202 s | **155 s** |
| B4. Re-verify signature and lock, create backup identity, readiness again | 202–205 s | 0 failures, 3 warnings |
| B5. Verify loaded images against the lock (2nd pass) | 205–361 s | **156 s**, identical work repeated inside the release's own `install.sh` |
| B6. PostgreSQL start + pre-migration gate | 361–375 s | |
| B7. 102 migrations + post-migration gates + probe role | 375–379 s | |
| B8. Secrets, administrator, option library (587), ICD-10 (16,175), guidance baselines | 381–425 s | |
| B9. First verified backup | 425–442 s | |
| B10. Update agent + host monitoring units | 442–448 s | |
| B11. Doctor, final backup verification | 448–453 s | |
| **Total, phase B** | **455 s (7 min 35 s)** | Exit 0; clinical HTTPS 307→login, Status fallback 200 |

## What the operator had to do

- Type or paste a **54-line shell block**, editing three values in it.
- Answer **26 prompts**. Two of them are long strings typed from a separate
  record: the 64-character lock SHA-256 and the 44-character signing-key
  fingerprint.
- Know in advance two exact CIDR allowlists and two DNS names.
- Read at least `installation.md` and the client section of
  `release-validation.md`.

## Findings for 1.4.0

1. **Image verification is 68% of install time, and half of it is duplicated.**
   `load-offline.sh` runs `verify-loaded-release-images.sh` against the lock,
   then the candidate's `install.sh` runs it again on the same images seconds
   later (311 s of 455 s). Each pass does `docker image save` of every image
   and hashes the output; the tools and migrate images are 2.4 GB each. The
   online route runs three passes (`pulled.lock`, the lock, then `install.sh`).
   A single authoritative pass per transaction, with the later check reduced to
   comparing `docker image inspect` identities, would cut about 2.5 minutes
   offline and more online. The security argument for the repeat needs to be
   written down before removing it.
2. **The typed trust inputs are the biggest human cost.** The 54-line block and
   the two long strings are exactly what W2 (zero-confirmation install) removes.
3. **The pre-install readiness report shows warnings that are not the
   operator's problem yet.** Examples: "outbound certificate authority file is
   missing; run scripts/ensure-api-secrets-layout.sh" (the install creates it;
   it is gone from the second report) and local-TLS bench warnings.
4. **Doctor warns that the fresh local certificate expires within 30 days.** On
   a `local` TLS install that is always true of Caddy's short-lived leaf, so a
   brand-new appliance ends its install with two warnings that mean nothing.
5. **"Installation complete" and the address list print twice.** The launcher
   and the guided installer each print them.
6. **The supply prompt in 1.3.x says connected mode needs credentials.** Fixed
   on the 1.4.0 branch together with W1.

## Reproduce

```sh
# On the VM, after removal and with the release assets in $MEDIA:
sh doc-verify.sh                       # the documented block, three values filled in
sudo sh "$BOOTSTRAP_ROOT/scripts/install-guided.sh" "$LOCK" "$SIDECAR" "$MEDIA" < answers
```

The timestamped log was kept on the VM at `/home/hospital/phaseB.log`.
