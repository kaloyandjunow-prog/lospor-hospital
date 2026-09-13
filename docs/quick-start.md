# Quick start

[Български](quick-start.bg.md) | **English**

Two pages from an empty server to an appliance ready for clinical use. The
other documents hold the detail; this one holds the order.

## 1. A host

An Ubuntu Server 24.04 LTS virtual machine or server with at least 8 processor
cores, 16 GiB of memory and 200 GiB free disk, reachable by the hospital
network; the installer's readiness check refuses less.
The quickest way is [Preparing the host](host-preparation.md): an autoinstall
seed, and on Hyper-V a script that builds the VM from it. Any Ubuntu 24.04
server with the packages listed in [Installation](installation.md) works too.

## 2. Install: three ways in, one installer

Each way verifies the maintainer's signature before anything runs, and nothing
has to be typed or compared:

- **Online, from the console:**
  `curl -fsSLO https://lospor.org/install/losporctl-install.sh`, then
  `sudo sh losporctl-install.sh`. A host prepared with the seed offers this at
  the first console login.
- **Offline, from the maintainer's USB:** `sudo sh /media/usb/losporctl-install.sh`.
- **Hyper-V:** build the VM with the kit, then use either of the above inside it.

The installer asks about 13 questions in Bulgarian or English. They cover
language, the clinical and research addresses, certificates, the networks that
may open Status and Research, the hospital's name and city, and the first
administrator. Everything else takes a safe default and can be changed later in
Status or with `losporctl`.

## 3. Installed is not ready

When the installer finishes, the appliance is **installed**: services run,
backups start, doctor passes. It is **not yet approved for clinical use.** Open
Status at `https://<clinical address>/status/` and go to **Go-live**. The page
checks what the appliance can prove (certificate, services, clock, backups,
off-host copy, escrowed secrets, update route, terminology). It also asks for
five sign-offs only people can give: a restore drill, network verification,
stored MFA recovery codes, a host patch policy, and clinical acceptance. The
verdict reads **Ready for clinical use** only when all of them hold.

The usual way there:

1. **Maintenance → Copies kept elsewhere**: set up the share or SFTP server,
   test it, and run a drill from it.
2. Copy `site.env`, `.env` and `secrets/` to the hospital's escrow, then run
   `sudo sh /opt/lospor-hospital/current/scripts/acknowledge-secrets-escrow.sh`.
3. **Terminology**: import the approved terminology package.
4. **Maintenance → Restore drill**, then record it on **Go-live** with the other
   sign-offs.

## 4. Every day after

- **Status** answers "is this appliance safe to use today?" and every card says
  what to do next.
- **At the console**, `sudo losporctl status` gives the same answer in plain
  words, and `sudo losporctl help` lists everything else.
- The [Operations](operations.md) checklist says what to look at daily, weekly,
  monthly and quarterly.

When something is wrong, `sudo losporctl support-bundle create` writes a file
for LOSPOR support. It holds no patient, case, account, name, address or
secret; read it before you send it.
