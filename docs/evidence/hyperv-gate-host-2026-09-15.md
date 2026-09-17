# Hyper-V release gate: host phase, 15 September 2026

The first passing run of `scripts/hyperv-install-gate.ps1`, for the 1.4.0
changes to the Hyper-V kit: the installer carried onto the VM, the one-time
password, and the kit removing the installation media itself. No release was
installed; that phase needs the 1.4.0 candidate.

## Setup

| Item | Value |
|---|---|
| Host | Windows 11 Pro with Hyper-V, elevated PowerShell 5.1 |
| Switch | Default Switch (existing; the kit creates none) |
| ISO | `ubuntu-24.04.4-live-server-amd64.iso`, SHA-256 matched Canonical's |
| VM | "LOSPOR Gate Host", 8 GB memory and 4 processors (below the appliance minimum, allowed for a host-only run), 256 GB dynamic disk on E: |
| Commits | `release-1.4.0` at `0834a2f` |
| Command | `hyperv-install-gate.ps1 -IsoPath … -SshKeyPath … -VmDirectory … -MemoryGB 8 -ProcessorCount 4 -EvidencePath …` |

## Result: passed

| Step | Minutes | Result |
|---|---|---|
| Create the VM with the host kit (ISO check and copy, unattended Ubuntu install, media removal, restart) | 41.9 | passed |
| Reach the VM over SSH with the key alone | 0.3 | passed |
| Check the installation media are gone | 0 | passed |
| Check the host the seed prepared | 0 | passed |

The host checks, over SSH as `lospor`:

- the SSH key logged in with no console login;
- the one-time password worked for `sudo` and was not expired;
- `/usr/local/lib/lospor/losporctl-install.sh` matched the repository's copy
  byte for byte (SHA-256 `e04cedaf…cbfd5` on the earlier kept VM);
- Docker Engine 29.8.0 and Compose 5.5.1 ran, with containerd,
  systemd-timesyncd and unattended-upgrades active;
- no DVD drive and no seed disk were attached, and the ISO copy and seed disk
  files were deleted. The VM was removed at the end.

Ubuntu's own installation took 8 minutes on an earlier run and 41 on this one.
Both downloaded packages from Ubuntu's and Docker's repositories, so the time
follows the mirrors rather than the kit.

## What the earlier runs found

Two runs before this one failed, on faults the kit's source-reading tests could
not see. Both are fixed in `0834a2f`:

1. The kit looked for `losporctl-install.sh` in `infra\scripts` (two folders
   up instead of three).
2. `Remove-VMDvdDrive` fails with "cannot be found" once Ubuntu has ejected the
   disc at shutdown, so the kit stopped before removing the media. Reproduced on
   a throwaway VM; removing the drive through Hyper-V's WMI provider works in both
   cases.

A third run passed the kit and stopped in the gate's own address lookup, which
strict mode refused on an empty adapter list; the checks were then run by hand
on that kept VM and passed, before this clean run.

## Not yet covered

- Installing a release through the gate (`-ReleaseMedia`), which needs the
  1.4.0 candidate. That run is also the timed final install (milestone M5).
- `losporctl-install.sh --resume` and `--discard-unfinished` on a real failed
  installation. They pass their shell tests on Linux.
