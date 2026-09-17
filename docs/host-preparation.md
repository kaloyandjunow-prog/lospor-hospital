# Preparing the host

[Български](host-preparation.bg.md) | **English**

LOSPOR Hospital runs on an Ubuntu Server 24.04 LTS virtual machine or server.
Supplied files prepare one without typing package lists:

- `infra/host/autoinstall/user-data` is an Ubuntu autoinstall seed. It works
  the same on Hyper-V, VMware and bare metal.
- `infra/host/hyperv/New-LosporHospitalVm.ps1` builds a Hyper-V VM from that
  seed.
- `infra/host/hyperv/Install-LosporHospital.ps1` is the wizard around it: one
  set of questions on Windows, then Ubuntu and LOSPOR install by themselves.

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

## Hyper-V with the wizard (recommended)

Download `lospor-hospital-X.Y.Z-windows-kit.zip`, right-click it and choose
**Extract All**. For a hospital without internet, extract it into the folder
holding the release files from the maintainer's USB stick. (An unpacked release
folder holds the same files and works too.) Then double-click
**Install LOSPOR Hospital**. It asks for administrator rights, in English or
Bulgarian, and checks every answer before it creates anything:

| Page | Asked | Filled in or detected |
|---|---|---|
| The virtual machine | name, network switch, cores, memory, disk, folder, disk encryption | the switches that exist (an External one first), this machine's processors and memory; 8 cores, 24 GB and 400 GB prefilled, never below 8, 16 and 256 |
| Signing in to the server | the `lospor` password, an SSH public key (Browse for the `.pub` file, or paste it) | |
| The hospital | clinical and research addresses, hospital name and city | whether both names are in DNS yet |
| The certificate | the hospital's own authority (one `.pfx` and its password, or PEM certificate, key and CA), Let's Encrypt (an email), or local | whether the `.pfx` opens, covers both names, is valid for 30 more days and includes the root, or a CA file is needed |
| The administrator | email, username, first and last name, password | the appliance's password rules |
| Check and install | the Ubuntu ISO, or download it | offline when the complete release files are beside the kit, otherwise online, always the kit's own version |

Then nothing needs typing, and the window follows it through:

1. Ubuntu installs by itself and the VM switches off (about 20 minutes).
2. The wizard removes the installation media. For an offline install it attaches
   a disk holding the release files, then starts the VM.
3. At first boot the server installs LOSPOR by itself:
   - If the two DNS names are not there yet, it says so, with the server's
     address, and continues once IT adds them.
   - Its installer verifies the maintainer's signature exactly as it does at the
     console.
4. The window ends with the Go-live address, or with the reason the install
   stopped and `sudo sh /usr/local/lib/lospor/losporctl-install.sh`, which, run
   again, offers `--resume` when the attempt left anything behind.

How the answers travel:

- **Kept out of Ubuntu's setup file:** the administrator password and
  certificate files go on the setup disk beside it, because Ubuntu's installer
  keeps that file in its logs.
- **On Windows:** the wizard's own copies sit in a folder only administrators
  can read, and are overwritten once the VM has them. The setup disk is deleted
  once Ubuntu is installed.
- **On the server:** the first boot reads the password and the certificate
  first and deletes them from the disk. A `.pfx` becomes the certificate chain,
  the private key and the trusted root in `secrets/tls`.

Progress reaches Windows through Hyper-V's key-value exchange. The seed installs
`linux-cloud-tools-generic` for it, which also lets Hyper-V Manager show the
VM's address.

On Windows Server Core, which has no desktop, run
`powershell -ExecutionPolicy Bypass -File .\infra\host\hyperv\Install-LosporHospital.ps1`
from the extracted folder: the same questions are asked as text.

## Hyper-V from PowerShell

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
- creates a Generation 2 VM with Secure Boot, 24 GB of memory, 8 processors and
  a 400 GB disk that grows as it is used, adjustable with `-MemoryGB`,
  `-ProcessorCount` and `-DiskGB`. The installer's readiness check needs at
  least 16 GB, 8 processors and 200 GB still free once Ubuntu, the images, the
  databases and local backups are in place, so 256 GB is the smallest disk.

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
