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
- **Hyper-V:** build the VM with the kit. It carries the installer onto the VM,
  and the first console login offers to run it.

If an installation stops part-way, run the same command again: it says what the
attempt left and offers `--resume` or `--discard-unfinished` (see [Release
validation](release-validation.md#when-a-first-installation-did-not-finish)).

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
off-host copy, escrowed secrets, update route). It also asks for
five sign-offs only people can give: a restore drill, network verification,
stored MFA recovery codes, a host patch policy, and clinical acceptance. The
verdict reads **Ready for clinical use** only when all of them hold.

Go-live is the journey there. It puts the steps in order, in five stages,
shows **Next step** at the top with why it matters, who does it, and a link to
the Status page that does it or the one console command for what Status
deliberately cannot do. Signing in lands on it until the appliance is ready,
and it picks up wherever things stand, so it can be left and resumed.

The steps that need the console:

1. **Escrow the secrets**: plug in a USB stick or mount a share from outside the
   server, then `sudo losporctl secrets escrow /media/usb`. It writes the
   secrets encrypted, checks the copy and records it; keep the passphrase it
   shows apart from the USB stick.
2. **Terminology (optional)**: the release already carries the codes clinical
   use needs. Only to import an Athena package, place its folder under
   `reference-data/`; the **Terminology** page then offers it by name.
3. **A certificate from the hospital's own authority**, if used: place its files
   and run `sudo losporctl config certificate operator FULLCHAIN KEY CA`.

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
