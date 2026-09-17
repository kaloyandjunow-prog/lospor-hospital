# Windows wizard: end-to-end on Hyper-V, 15 September 2026

Two runs of `infra/host/hyperv/Install-LosporHospital.ps1 -AnswersFile` on a real
Hyper-V host, through the unattended Ubuntu installation and the first boot.
They were aimed at a release version that does not exist (9.9.9), so that no
LOSPOR appliance was installed. What was under test is everything up to the
signature-verifying installer: the answers, the certificate, the progress
report and the outcome shown on Windows.

## Setup

| Item | Value |
|---|---|
| Host | Windows 11 Pro with Hyper-V, elevated PowerShell 5.1 |
| Switch | Default Switch |
| ISO | `ubuntu-24.04.4-live-server-amd64.iso`, SHA-256 matched Canonical's |
| VM | "LOSPOR Wizard Test", 8 GB and 4 processors (`LOSPOR_WIZARD_ALLOW_SMALL_VM=1`), 80 GB |
| Certificate | a `.pfx` exported by Windows (`Export-PfxCertificate`) with its CA as a DER `.cer` |
| Answers | Bulgarian locale, Cyrillic hospital and administrator names, SSH key, chosen console password |

## Run 1: found two defects

- Ubuntu installed in 8 minutes with `linux-cloud-tools-generic`. The answers
  reached the first boot, and its progress reached the wizard through Hyper-V's
  key-value exchange.
- With one name not in DNS (`www.lospor.org`), the first boot reported
  "Waiting for DNS", naming the server's address (172.17.77.173). Once the name
  resolved, it continued by itself.
- The `.pfx` became `secrets/tls/fullchain.pem` (subject `lospor.org`, both
  names in the SAN), `private.key` (0600) and `hospital-ca.pem`.
- The installer then refused to start. It took the first-boot unit,
  `lospor-firstboot.service`, for the remains of an unfinished installation
  (every `lospor-*` unit counts). **Fixed:** the unit is now
  `firstboot-lospor.service`, and a test holds the rule.
- Windows PowerShell read the result file as ANSI, so the Bulgarian lines of
  the reason were garbled. The same would have garbled Cyrillic answers read
  from an answers file. **Fixed:** both are read as UTF-8, and the reason now
  keeps only the installer's English lines.

## Run 2: passed

- Ubuntu installed in 9 minutes; Hyper-V Manager showed the VM's address.
- The first boot placed the certificate and ran `losporctl-install.sh`, which
  stopped at its first trust check: `lospor.org/.well-known/lospor-release-key.txt`
  answered 404 (not deployed yet), so the signing key could not be confirmed.
- The wizard showed that reason in Bulgarian and English and exited 1.
- On the VM afterwards:
  - `/var/lib/lospor-firstboot` and `/run/lospor-firstboot` were gone;
  - `firstboot-lospor.service` was disabled;
  - the administrator password was found nowhere under `/var/log`,
    `/var/lib`, `/opt` or `/run`.
- `infra/host/autoinstall/lospor-firstboot.test.sh` passed on that VM (6 of 6).
- The VM and its folder were removed at the end.

## Still to prove

A full installation from the wizard: online once lospor.org serves the key
fingerprint, and offline from a release disk, with the 1.4.0 candidate.
