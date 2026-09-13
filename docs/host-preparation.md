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
- a console user `lospor`. Its initial password is `lospor`, and it must be
  changed at the first login.

At the first console login it offers to start the online installation. It
doesn't offer this over SSH or once LOSPOR is installed.

## Hyper-V (Windows Server 2019, 2022, 2025, or Windows with Hyper-V)

The script is not code-signed. Copy the `infra/host` folder to the Hyper-V
host, then in an elevated PowerShell run:

```powershell
Unblock-File .\infra\host\hyperv\New-LosporHospitalVm.ps1
.\infra\host\hyperv\New-LosporHospitalVm.ps1 -SwitchName "Hospital LAN" -DownloadDirectory D:\iso -WhatIf
.\infra\host\hyperv\New-LosporHospitalVm.ps1 -SwitchName "Hospital LAN" -DownloadDirectory D:\iso
```

`-WhatIf` shows what would happen and changes nothing. The script:

- refuses a switch that does not exist, and never creates or changes one;
- downloads Ubuntu 24.04.5 (or uses `-IsoPath`) and refuses an ISO whose
  SHA-256 differs from Canonical's published value;
- creates a Generation 2 VM with Secure Boot, 16 GB of memory, 8 processors and
  a 256 GB disk (what the installer's readiness check requires), adjustable
  with `-MemoryGB`, `-ProcessorCount` and `-DiskGB`.

`-AuthorizedKeyPath` adds your SSH public key. `-EncryptDisk` asks for a
full-disk encryption passphrase. Keep it in the hospital's escrow: without it
the server does not boot.

Open the VM console. When the installer asks
**Continue with autoinstall? (yes|no)**, type `yes`. Installation takes 10–20
minutes and restarts. Log in as `lospor`, set a new password, and accept the
offer to install LOSPOR. Afterwards remove the installation media, as the
script prints.

## VMware or bare metal

Put `user-data` and an empty `meta-data` on a volume labelled `CIDATA`: a small
virtual disk, a USB stick, or an ISO. On Linux, `cloud-localds seed.iso
user-data meta-data` makes the ISO. Attach or insert it together with the
Ubuntu 24.04 server ISO and boot; the same single confirmation follows. For disk
encryption, add `password: "…"` under `storage: layout:` in your copy of the
seed, or use the hypervisor's or storage array's encryption.

## Then

Continue with [Installation](installation.md): the host already has
everything that section lists.
