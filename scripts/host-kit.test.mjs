import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

// The host kit cannot be exercised in CI (it needs Hyper-V and an Ubuntu
// installation), so these checks hold the promises it makes to a hospital.
// It was proven by hand on a Hyper-V host: -WhatIf, a refused unknown switch,
// the ISO hash, a -SeedOnly CIDATA disk read back byte for byte, and a full
// unattended Ubuntu installation of a new VM.

const root = resolve(import.meta.dirname, "..")
const kit = readFileSync(join(root, "infra/host/hyperv/New-LosporHospitalVm.ps1"), "utf8")
const seed = readFileSync(join(root, "infra/host/autoinstall/user-data"), "utf8")

test("the kit never creates or changes a virtual switch", () => {
  assert.doesNotMatch(kit, /(New|Set|Remove|Rename)-VMSwitch/)
  assert.match(kit, /Get-VMSwitch -Name \$SwitchName/)
})

test("the Ubuntu ISO is accepted only by a SHA-256 compiled into the kit", () => {
  const table = kit.match(/\$KnownIsos = @\{([\s\S]*?)\n\}/)
  assert.ok(table, "no ISO hash table")
  const entries = [...table[1].matchAll(/"(ubuntu-24\.04\.\d+-live-server-amd64\.iso)" = "([a-f0-9]{64})"/g)]
  assert.ok(entries.length >= 1, "no pinned ISO")
  assert.match(kit, /Get-FileHash -Algorithm SHA256/)
  assert.match(kit, /\$DownloadUrl = "https:\/\/releases\.ubuntu\.com\//)
  const download = kit.match(/\$DownloadIso = "([^"]+)"/)[1]
  assert.ok(entries.some(([, name]) => name === download), "the ISO the kit downloads is not pinned")
})

test("the VM is Generation 2 with Secure Boot, and boots the installed system before the installer", () => {
  assert.match(kit, /New-VM [^\n]*-Generation 2/)
  assert.match(kit, /-EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority/)
  // With the DVD first, the reboot after installation offered to install again.
  assert.match(kit, /Set-VMFirmware -VM \$vm -BootOrder \$system, \$dvd/)
  assert.match(kit, /FAT32 -NewFileSystemLabel CIDATA/)
  assert.match(kit, /UTF8Encoding\(\$false\)/, "the seed must be written without a byte-order mark")
})

test("the kit is PowerShell 5.1-compatible and dry-runs without side effects", () => {
  assert.match(kit, /\[CmdletBinding\(SupportsShouldProcess = \$true\)\]/)
  assert.doesNotMatch(kit, /\?\?|\?\.|&&|\|\|/, "PowerShell 7-only operators")
  for (const action of ["Create the CIDATA seed disk", "Create a Generation 2 VM", "Download Ubuntu server ISO", "Write an Ubuntu ISO that installs without asking"]) {
    assert.match(kit, new RegExp(`ShouldProcess\\([^)]*"${action}`), `${action} is not behind ShouldProcess`)
  }
})

test("the VM installs from a verified ISO copy that does not ask, and falls back safely", () => {
  // Ubuntu skips "Continue with autoinstall?" only with `autoinstall` on the
  // kernel command line, so the kit adds it to the boot menu of a copy.
  assert.match(kit, /'\$1 autoinstall ---'/)
  assert.match(kit, /\$boot\.PlatformId = 0xEF/, "the copy must boot on UEFI, the only firmware of a Generation 2 VM")
  // The copy is made only after Canonical's checksum has been verified.
  assert.ok(kit.indexOf("matches Canonical's published SHA-256") < kit.indexOf("New-AutoinstallIso -SourceIso"))
  assert.match(kit, /Add-VMDvdDrive -VM \$vm -Path \$bootIso/)
  // No imaging components, or -ConfirmInstall: Canonical's ISO, and the installer asks once.
  assert.match(kit, /\[switch\] \$ConfirmInstall/)
  assert.match(kit, /Installing from Canonical's ISO instead: type yes/)
  // The copy wipes whatever boots from it, so the operator is told to delete it.
  assert.match(kit, /erases the disk of any machine that boots from it/)
})

test("the seed installs the appliance's prerequisites with Docker's key pinned by full fingerprint", () => {
  assert.match(seed, /^#cloud-config\n/)
  assert.match(seed, /keyid: 9DC858229FC7DD38854AE2D88D81803C0EBFCD88/)
  for (const pkg of ["docker-ce", "docker-compose-plugin", "openssl", "curl", "python3", "gzip", "tar", "whiptail", "unattended-upgrades", "systemd-timesyncd"]) {
    assert.match(seed, new RegExp(`^    - ${pkg}$`, "m"), `${pkg} is not installed`)
  }
  assert.match(seed, /APT::Periodic::Unattended-Upgrade "1";/)
  // Ubuntu's installer (curtin) has no $KEY_FILE placeholder: on a real Hyper-V
  // install it stopped with KeyError: 'KEY_FILE'. The key is scoped afterwards.
  assert.doesNotMatch(seed.replace(/^\s*#.*$/gm, ""), /\$KEY_FILE/)
  // On 24.04 the installer writes the source as deb822 docker.sources.
  assert.match(seed, /sources=\/target\/etc\/apt\/sources\.list\.d\/docker\.sources/)
  assert.match(seed, /Signed-By: \/etc\/apt\/keyrings\/docker\.%s/)
})

test("SSH never takes a password, and the one console password must be changed at first login", () => {
  assert.match(seed, /allow-pw: false/)
  assert.match(seed, /curtin in-target -- chage -d 0 lospor/)
  const hashes = seed.match(/\$6\$[./A-Za-z0-9]+\$[./A-Za-z0-9]+/g) ?? []
  assert.equal(hashes.length, 1, "exactly one crypted password, the documented initial one")
  assert.doesNotMatch(seed, /password: "?(?!\$6\$)[^"\n]+"?$/m, "a plaintext password in the seed")
})

test("the first console login offers the signed installer, never over SSH", () => {
  assert.match(seed, /lospor-first-login\.sh/)
  assert.match(seed, /\[ -z "\$\{SSH_CONNECTION:-\}" \]/)
  assert.match(seed, /https:\/\/lospor\.org\/install\/losporctl-install\.sh/)
  assert.match(seed, /\[ ! -e \/opt\/lospor-hospital\/current \]/)
})
