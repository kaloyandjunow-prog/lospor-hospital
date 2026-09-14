# Preparing the host

[Български](host-preparation.bg.md) | **English**

LOSPOR Hospital runs on an Ubuntu Server 24.04 LTS virtual machine or server.
Two supplied files prepare one without typing package lists:

- `infra/host/autoinstall/user-data` is an Ubuntu autoinstall seed. It works
  the same on Hyper-V, VMware and bare metal.
- `infra/host/hyperv/New-LosporHospitalVm.ps1` builds a Hyper-V VM from that
  seed.

Both are in the release, and in the repository at the same paths.

## What the seed installs

- the minimal Ubuntu server, with LVM so the data volume can grow;
- OpenSSH, which accepts keys only, never a password;
- Docker Engine and Compose from Docker's repository, with Docker's signing key
  pinned by its full fingerprint;
- OpenSSL, curl, Python 3, gzip, tar and whiptail;
- automatic security updates and time synchronisation;
- a console user `lospor`. There is no shared initial password: the Hyper-V
  kit makes a one-time password for each VM, and anyone using the seed directly
  sets their own (see VMware or bare metal below).

When Ubuntu is installed the machine switches off, so the installation media
can be removed before it starts again. At the first console login it offers to
start the installation. It doesn't offer this over SSH or once LOSPOR is
installed.

## Hyper-V (Windows Server 2019, 2022, 2025, or Windows with Hyper-V)

The scripts are not code-signed. Copy the whole unpacked release folder to the
Hyper-V host (it holds `infra\host` and the installer in `scripts`), then in
an elevated PowerShell in that folder run:

```powershell
Get-ChildItem .\infra\host -Recurse -Filter *.ps1 | Unblock-File
.\infra\host\hyperv\New-LosporHospitalVm.ps1 -SwitchName "Hospital LAN" -DownloadDirectory D:\iso -WhatIf
.\infra\host\hyperv\New-LosporHospitalVm.ps1 -SwitchName "Hospital LAN" -DownloadDirectory D:\iso
```

`-WhatIf` shows what would happen and changes nothing. The script:

- refuses a switch that does not exist, and never creates or changes one;
- downloads Ubuntu 24.04.5 (or uses `-IsoPath`) and refuses an ISO whose
  SHA-256 differs from Canonical's published value;
- writes a copy of that ISO whose boot menu adds `autoinstall`, so the Ubuntu
  installer does not stop to ask "Continue with autoinstall?" (the installer
  files are unchanged; Windows' own imaging components write it). If they are
  missing, or with `-ConfirmInstall`, it uses Canonical's ISO and the installer
  asks once;
- creates a Generation 2 VM with Secure Boot, 16 GB of memory, 8 processors and
  a 256 GB disk (what the installer's readiness check requires), adjustable
  with `-MemoryGB`, `-ProcessorCount` and `-DiskGB`.

`-AuthorizedKeyPath` adds your SSH public key. `-EncryptDisk` asks for a
full-disk encryption passphrase. Keep it in the hospital's escrow: without it
the server does not boot.

The script also carries the release's own installer onto the VM, so the first
login offers that copy instead of downloading one.

It shows a **one-time password** for the `lospor` user as soon as the VM starts.
Note it: it is stored nowhere and is not shown again. Then it waits while
Ubuntu installs (about 15–20 minutes; open the VM console to watch, nothing
needs typing). When Ubuntu has finished and switched the VM off, the script
removes the installation media, deletes its ISO copy (which would erase any
machine that boots from it) and starts the VM. With `-NoWait` it returns at
once and prints those steps for you to do.

Log in on the console as `lospor` with the one-time password, choose a new
one, and accept the offer to install LOSPOR. With `-AuthorizedKeyPath`, SSH with
that key works as soon as the VM is up, no console login needed; the one-time
password is then for `sudo` until you change it with `passwd`.

## VMware or bare metal

In your copy of `user-data`, replace `LOSPOR_PASSWORD_HASH` with the hash of a
password for `lospor`: `openssl passwd -6` prints one. The installation stops
at once if the placeholder is left. Put `user-data` and an empty `meta-data` on
a volume labelled `CIDATA`: a small virtual disk, a USB stick, or an ISO. On
Linux, `cloud-localds seed.iso user-data meta-data` makes the ISO. Attach or
insert it together with the Ubuntu 24.04 server ISO and boot; the same single
confirmation follows. When the machine switches off, remove both and start it.
For disk encryption, add `password: "…"` under `storage: layout:` in your copy
of the seed, or use the hypervisor's or storage array's encryption.

Used this way the seed carries no installer, so the first login shows the
online and offline commands without running either.

## Then

Continue with [Installation](installation.md): the host already has
everything that section lists.
