import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

// Creating a VM cannot run in CI (it needs Hyper-V and an Ubuntu installation),
// so these checks hold the promises the kit makes to a hospital. It was proven
// by hand on a Hyper-V host: -WhatIf, a refused unknown switch, the ISO hash, a
// -SeedOnly CIDATA disk read back byte for byte, and a full unattended Ubuntu
// installation of a new VM. What does not need Hyper-V -- the password hash and
// composing the seed -- runs below wherever PowerShell is installed.

const root = resolve(import.meta.dirname, "..")
const kit = readFileSync(join(root, "infra/host/hyperv/New-LosporHospitalVm.ps1"), "utf8")
const helper = join(root, "infra/host/hyperv/LosporHostKit.ps1")
const seed = readFileSync(join(root, "infra/host/autoinstall/user-data"), "utf8")
const bootstrap = readFileSync(join(root, "scripts/losporctl-install.sh"), "utf8")

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
  for (const source of [kit, readFileSync(helper, "utf8")]) {
    assert.doesNotMatch(source, /\?\?|\?\.|&&|\|\|/, "PowerShell 7-only operators")
  }
  assert.match(kit, /\[CmdletBinding\(SupportsShouldProcess = \$true\)\]/)
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
})

test("the kit removes the installation media itself, and only after Ubuntu finished", () => {
  // The seed switches the machine off when it is done, and its last step marks
  // the seed disk, so "off" alone -- a person pulling the plug -- is not taken
  // for "installed".
  assert.match(seed, /^  shutdown: poweroff$/m)
  const late = seed.slice(seed.indexOf("  late-commands:"))
  assert.match(late, /mount -t vfat \/dev\/disk\/by-label\/CIDATA/)
  assert.ok(late.lastIndexOf("lospor-installed") > late.lastIndexOf("    - "), "the mark is not the last step")

  const wait = kit.indexOf('State -ne "Off"')
  const mark = kit.indexOf("Test-LosporInstalledMark $seedDisk")
  const removal = kit.indexOf("Remove-LosporDvdDrives $Name")
  assert.ok(wait > 0 && wait < mark && mark < removal, "media removed before the wait and the mark")
  // Remove-VMDvdDrive fails once Ubuntu has ejected the disc (a real run).
  assert.doesNotMatch(kit, /\| Remove-VMDvdDrive/)
  assert.match(kit, /RemoveResourceSettings/)
  assert.match(kit.slice(mark, removal), /Stop-Kit "The VM switched off before Ubuntu recorded a finished installation\. Nothing was removed/)
  assert.match(kit.slice(removal), /Remove-Item -LiteralPath \$seedDisk -Force/)
  assert.match(kit.slice(removal), /if \(\$autoinstallIso\) \{ Remove-Item -LiteralPath \$autoinstallIso -Force \}/)
  assert.ok(kit.indexOf("Start-VM -VM $vm", removal) > removal, "the VM is not started again")
  // A person who stops waiting is told exactly what is left to do, and has
  // already been shown the one-time password.
  assert.match(kit, /\[switch\] \$NoWait/)
  assert.ok(kit.indexOf("Show-LosporLogin", kit.indexOf("Start-VM -VM $vm")) < wait, "the password is shown only after the wait")
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

test("there is no shared password: the seed carries a placeholder it refuses to install with", () => {
  assert.match(seed, /allow-pw: false/)
  assert.doesNotMatch(seed, /\$6\$[./A-Za-z0-9]+\$[./A-Za-z0-9]{20,}/, "a crypted password in the shared seed")
  assert.match(seed, /^    password: "LOSPOR_PASSWORD_HASH"$/m)
  // The guard must not match its own line, or no seed could ever install.
  const guard = seed.match(/^    - "(! grep -Eq .*LOSPOR_PASSWORD_\[H\]ASH.*)"$/m)
  assert.ok(guard, "no early-command guard against the placeholder")
  assert.match(seed, /curtin in-target -- chage -d 0 lospor # lospor-kit: expire/)
  assert.doesNotMatch(kit + seed, /password lospor|initial password `?lospor/)
})

test("the first console login offers the installer the kit carried, and never downloads and runs one", () => {
  assert.match(seed, /lospor-first-login\.sh/)
  assert.match(seed, /\[ -z "\$\{SSH_CONNECTION:-\}" \]/)
  assert.match(seed, /\[ ! -e \/opt\/lospor-hospital\/current \]/)
  assert.match(seed, /^    # lospor-kit: bootstrap$/m)
  assert.match(seed, /sudo sh "\$lospor_bootstrap"/)
  // The online command is still shown for a seed used by hand, but never run.
  const firstLogin = seed.slice(seed.indexOf("lospor-first-login.sh <<'EOF'"), seed.indexOf("      EOF"))
  for (const line of firstLogin.split("\n").filter(line => line.includes("curl"))) {
    assert.match(line, /^\s*printf /, `a download that runs: ${line.trim()}`)
  }
  // The kit takes the installer from the release it came with.
  // A real run found the path one level short, looking in infra\scripts.
  const relative = kit.match(/\$BootstrapPath = Join-Path \$PSScriptRoot "([^"]+)"/)[1].replaceAll("\\", "/")
  assert.ok(existsSync(resolve(root, "infra/host/hyperv", relative)), `the kit looks for the installer at ${relative}`)
  assert.equal(resolve(root, "infra/host/hyperv", relative), join(root, "scripts", "losporctl-install.sh"))
})

// ── What runs without Hyper-V ───────────────────────────────────────────────

const powershell = ["pwsh", "powershell.exe", "powershell"]
  .find(command => spawnSync(command, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" }).status === 0)
const noPowershell = powershell ? false : "PowerShell is not installed here"

function runPowershell(script) {
  const directory = mkdtempSync(join(tmpdir(), "lospor-host-kit-"))
  try {
    const file = join(directory, "run.ps1")
    writeFileSync(file, `﻿$ErrorActionPreference = "Stop"\n[Console]::OutputEncoding = [Text.Encoding]::UTF8\n. '${helper.replaceAll("'", "''")}'\n${script}\n`)
    const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    return result.stdout.replace(/\r\n/g, "\n")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("the one-time password hash is SHA-512 crypt, as Ubuntu reads it", { skip: noPowershell }, () => {
  const lines = runPowershell([
    'ConvertTo-LosporSha512Crypt "Hello world!" "saltstring"',
    'ConvertTo-LosporSha512Crypt "ab3de-fgh2k-mnpq4-rstu5" "abcdefghijklmnop"',
    'ConvertTo-LosporSha512Crypt "a very long password that is more than sixty four bytes long, to exercise the loop branch" "S/./0123456789AB"',
    "New-LosporOneTimePassword",
    "New-LosporOneTimePassword",
  ].join("\n")).trim().split("\n")
  // The specification's own test vector, then two checked against OpenSSL 3.5
  // (`openssl passwd -6 -salt SALT PASSWORD`).
  assert.equal(lines[0], "$6$saltstring$svn8UoSVapNtMuq1ukKS4tPQd8iKwSMHWjl/O817G3uBnIFNjnQJuesI68u4OTLiBFdcbYEdFCoEOfaS35inz1")
  assert.equal(lines[1], "$6$abcdefghijklmnop$BZ31PB4o.19iR85HXgsIt3IcCdHWf3b5u/TSWCweTEnvFWj5ZC1NCELK0tKgsCxmvpaw.NuuIS016vKFZJN/5.")
  assert.equal(lines[2], "$6$S/./0123456789AB$sWk0Vii2fz4jPIex/f6akRF45Qavthu/thkLXdSosdaIEK8iyZmmdbg8DHvOP074MBrXDdaO7Hn7PQkw0/ucG1")
  for (const password of lines.slice(3)) assert.match(password, /^[a-hjkmnp-z2-9]{5}(-[a-hjkmnp-z2-9]{5}){3}$/)
  assert.notEqual(lines[3], lines[4])
})

test("the composed seed carries this VM's password, key and installer, byte for byte", { skip: noPowershell }, () => {
  const directory = mkdtempSync(join(tmpdir(), "lospor-seed-"))
  try {
    const paths = {
      seed: join(root, "infra/host/autoinstall/user-data"),
      // Written with CRLF on purpose: a Windows checkout must still yield an
      // installer sh can run and a seed cloud-init can read.
      bootstrap: join(directory, "losporctl-install.sh"),
    }
    writeFileSync(paths.bootstrap, bootstrap.replace(/\n/g, "\r\n"))
    const quote = value => `'${value.replaceAll("'", "''")}'`
    const compose = key => runPowershell([
      `$r = ConvertTo-LosporSeed -Seed ([IO.File]::ReadAllText(${quote(paths.seed)})) -Bootstrap ([IO.File]::ReadAllText(${quote(paths.bootstrap)})) -PasswordHash '$6$salt$hash' ${key ? "-AuthorizedKey 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample kit@test' -DiskPassphrase 'sixteen characters or more'" : ""}`,
      "\"$($r.CarriesBootstrap) $($r.SetsPassword)\"",
      "[Console]::Out.Write($r.Text)",
    ].join("\n"))
    const withKey = compose(true)
    const [flags, ...text] = withKey.split("\n")
    const composed = text.join("\n")
    assert.equal(flags, "True True")
    assert.doesNotMatch(composed, /\r/)
    assert.match(composed, /^    password: "\$6\$salt\$hash"$/m)
    assert.doesNotMatch(composed, /LOSPOR_PASSWORD_HASH"$/m)
    assert.match(composed, /^    authorized-keys:\n      - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample kit@test"$/m)
    assert.match(composed, /^      sizing-policy: all\n      password: "sixteen characters or more"$/m)
    assert.doesNotMatch(composed, /chage -d 0 lospor/, "an expired password would refuse the SSH key")
    assert.match(compose(false), /chage -d 0 lospor/, "without a key the password must still be changed at first login")

    const encoded = composed.match(/printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d > \/target\/usr\/local\/lib\/lospor\/losporctl-install\.sh/)
    assert.ok(encoded, "the installer is not written onto the new system")
    assert.equal(Buffer.from(encoded[1], "base64").toString("utf8"), bootstrap.replace(/\r\n/g, "\n"))
    const sha = composed.match(/printf '%s  %s\\n' '([a-f0-9]{64})' \/target\/usr\/local\/lib\/lospor\/losporctl-install\.sh \| sha256sum -c --quiet -/)
    assert.ok(sha, "the written installer is not checked")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// ── The wizard: answers typed once on Windows, installed at first boot ───────

const wizard = readFileSync(join(root, "infra/host/hyperv/Install-LosporHospital.ps1"), "utf8")
const firstboot = readFileSync(join(root, "infra/host/autoinstall/lospor-firstboot.sh"), "utf8")

test("the wizard is PowerShell 5.1 code Windows can read", () => {
  for (const [name, source] of [["wizard", wizard], ["helper", readFileSync(helper, "utf8")], ["kit", kit]]) {
    assert.doesNotMatch(source, /\?\?|\?\.|&&|\|\|/, `${name}: PowerShell 7-only operators`)
    // PowerShell ends a string at these, which broke the first Bulgarian draft.
    assert.doesNotMatch(source, /[„“”‘’]/, `${name}: typographic quotes end PowerShell strings`)
    if (/[^\x00-\x7f]/.test(source)) assert.ok(source.startsWith("﻿"), `${name} has Bulgarian text but no byte-order mark`)
  }
})

test("the wizard checks every answer before creating anything, and hands the kit only files", () => {
  // Every page is checked, and nothing is created until all pass.
  for (const page of ["Test-ServerPage", "Test-LoginPage", "Test-HospitalPage", "Test-CertificatePage", "Test-AdministratorPage", "Test-SummaryPage"]) {
    assert.match(wizard, new RegExp(`\\$\\{function:${page}\\}`), `${page} is not a page check`)
  }
  assert.ok(wizard.indexOf("Test-AllPages") < wizard.indexOf("& $kitScript @kitArguments"))
  // Passwords reach the kit as secure strings or as files in an administrators-only folder, then are overwritten.
  assert.match(wizard, /ConsolePassword = \(& \$secure \$a\.ConsolePassword\)/)
  assert.match(wizard, /icacls \$work \/inheritance:r \/grant:r "\*S-1-5-32-544:\(OI\)\(CI\)F" \/grant:r "\*S-1-5-18:\(OI\)\(CI\)F"/)
  assert.match(wizard, /WriteAllBytes\(\$_\.FullName, \(New-Object byte\[\] \$_\.Length\)\)/)
  // An offline release is found beside the kit only when it is complete: see
  // "an incomplete offline release stops the wizard and the kit..." below.
  assert.match(wizard, /\$found = Test-LosporOfflineRelease \$folder/)
  assert.match(wizard, /ReleaseDirectory = \$release\.Folder/)
  // Server Core has no desktop: the same questions as text.
  assert.match(wizard, /InstallationType -eq "Server Core"/)
  // The kit never touches switches, and the wizard does not either.
  assert.doesNotMatch(wizard, /(New|Set|Remove|Rename)-VMSwitch/)
})

test("an incomplete offline release stops the wizard and the kit before anything is created, instead of falling back to online", () => {
  // The wizard checks the whole release, not image parts alone, and stops --
  // before any page is shown -- rather than silently continuing to the next
  // candidate folder or falling through to an online install.
  assert.match(wizard, /\$found = Test-LosporOfflineRelease \$folder/)
  assert.match(wizard, /if \(\$release -and \$release\.Problems\.Count -gt 0\) \{/)
  assert.ok(
    wizard.indexOf("if ($release -and $release.Problems.Count -gt 0)") < wizard.indexOf("function Invoke-TextWizard"),
    "the offline-release check must run before any wizard page is shown",
  )
  // The kit's own -ReleaseDirectory validation used the same shared check, not
  // a lock-count check that never looked at the artifacts the lock names.
  assert.match(kit, /\$found = Test-LosporOfflineRelease \$ReleaseDirectory/)
  assert.match(kit, /if \(\$found\.Problems\.Count -gt 0\) \{/)
  assert.doesNotMatch(kit, /if \(\$locks\.Count -ne 1\) \{ Stop-Kit "\$ReleaseDirectory must hold exactly one/)
})

test("the offline release check verifies every artifact the lock names, not image parts alone", { skip: noPowershell }, () => {
  const directory = mkdtempSync(join(tmpdir(), "lospor-offline-release-"))
  try {
    const version = "9.9.9"
    const prefix = `lospor-hospital-${version}`
    const lockName = `${prefix}-release.lock`
    const names = {
      manifest: `${prefix}-manifest.json`,
      deployment: `${prefix}-deployment.tar.gz`,
      evidence: `${prefix}-security-evidence.tar.gz`,
      part: `${prefix}-images.tar.gz.part-000`,
    }
    const sizes = { manifest: 10, deployment: 1000, evidence: 20, part: 500 }
    const write = (name, bytes) => writeFileSync(join(directory, name), Buffer.alloc(bytes, 1))
    for (const key of Object.keys(names)) write(names[key], sizes[key])
    const lockLines = [
      "LOSPOR-HOSPITAL-RELEASE-LOCK-V2",
      `release\t${version}\thospital-${version}\t${"a".repeat(40)}\tlinux/amd64\t2026-01-01T00:00:00.000Z\t${"b".repeat(64)}`,
      `artifact\tmanifest\t000\t${names.manifest}\t${sizes.manifest}\t${"c".repeat(64)}`,
      `artifact\tdeployment\t000\t${names.deployment}\t${sizes.deployment}\t${"d".repeat(64)}`,
      `artifact\tsecurity-evidence\t000\t${names.evidence}\t${sizes.evidence}\t${"e".repeat(64)}`,
      `artifact\toffline-part\t000\t${names.part}\t${sizes.part}\t${"f".repeat(64)}`,
    ]
    writeFileSync(join(directory, lockName), `${lockLines.join("\n")}\n`)
    writeFileSync(join(directory, `${lockName}.sha256`), `${"0".repeat(64)}  ${lockName}\n`)
    writeFileSync(join(directory, `${lockName}.sig`), Buffer.alloc(64))

    const check = () => runPowershell([
      `$r = Test-LosporOfflineRelease '${directory.replaceAll("'", "''")}'`,
      "if ($r) { \"$($r.Version)|$($r.Problems.Count)|$($r.Problems -join ';')\" } else { 'null' }",
    ].join("\n")).trim()

    // Complete: every artifact the lock names, plus the sidecar and signature, is present at its exact size.
    assert.equal(check(), `${version}|0|`)

    // Missing signature -- this is the exact class of bug found: a lock
    // could be judged "complete" while its detached signature, without which
    // the installer refuses everything, was never checked.
    rmSync(join(directory, `${lockName}.sig`));
    assert.equal(check(), `${version}|1|${lockName}.sig`)
    writeFileSync(join(directory, `${lockName}.sig`), Buffer.alloc(64))

    // Wrong-size signature.
    writeFileSync(join(directory, `${lockName}.sig`), Buffer.alloc(32))
    assert.match(check(), /is not 64 bytes/)
    writeFileSync(join(directory, `${lockName}.sig`), Buffer.alloc(64))

    // Missing checksum sidecar.
    rmSync(join(directory, `${lockName}.sha256`))
    assert.equal(check(), `${version}|1|${lockName}.sha256`)
    writeFileSync(join(directory, `${lockName}.sha256`), `${"0".repeat(64)}  ${lockName}\n`)

    // Missing deployment archive -- the other artifact role the old check
    // never looked at (it read only "artifact\toffline-part\t" lines).
    rmSync(join(directory, names.deployment))
    assert.equal(check(), `${version}|1|${names.deployment}`)
    write(names.deployment, sizes.deployment)

    // Missing security evidence.
    rmSync(join(directory, names.evidence))
    assert.equal(check(), `${version}|1|${names.evidence}`)
    write(names.evidence, sizes.evidence)

    // Wrong-size image part: present, but not what the signed lock describes.
    write(names.part, sizes.part - 1)
    assert.match(check(), new RegExp(`is ${sizes.part - 1} bytes, the lock names ${sizes.part}`))
    write(names.part, sizes.part)

    // Back to complete.
    assert.equal(check(), `${version}|0|`)

    // No release lock in the folder at all: not found, not "complete".
    rmSync(join(directory, lockName))
    assert.equal(check(), "null")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("the kit follows the first installation through Hyper-V and removes the release disk only when it installed", () => {
  assert.match(seed, /^    - linux-cloud-tools-generic$/m)
  assert.match(seed, /^    # lospor-kit: firstboot$/m)
  assert.match(kit, /Msvm_KvpExchangeComponent/)
  const installed = kit.indexOf('$progress.State -eq "installed") {')
  assert.ok(installed > 0 && kit.indexOf("Remove-VMHardDiskDrive", installed) > installed, "the release disk is not removed after installing")
  assert.match(kit, /The release disk stays attached, so the installation can be resumed from it/)
  // Attached only once Ubuntu is installed, so Ubuntu's installer never sees it.
  assert.ok(kit.indexOf("Add-VMHardDiskDrive -VM $vm -Path $releaseDisk") > kit.indexOf("Remove-LosporDvdDrives $Name"))
  assert.match(kit, /-FileSystem exFAT -NewFileSystemLabel LOSPORREL/)
  assert.match(firstboot, /release_label=LOSPORREL/)
})

test("the first boot reads its answers as data and deletes secrets", () => {
  assert.doesNotMatch(firstboot.replace(/^\s*#.*$/gm, ""), /\beval\b|^\s*\.\s+"\$answers"|source "\$answers"/m)
  assert.match(firstboot, /\*\\'\*\|\*\\"\*\|\*\\\\\*\|\*\\\$\*\|\*\\`\*/)
  assert.match(firstboot, /shred -u/)
  assert.match(firstboot, /HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_FILE="\$runtime_dir\/admin-password"/)
  assert.match(firstboot, /runtime_dir=\/run\/lospor-firstboot/)
})

test("the seed carries the first boot, its service and the answers, only when the wizard gives them", { skip: noPowershell }, () => {
  const directory = mkdtempSync(join(tmpdir(), "lospor-firstboot-seed-"))
  try {
    const seedPath = join(root, "infra/host/autoinstall/user-data")
    const bootstrapPath = join(root, "scripts/losporctl-install.sh")
    const firstbootPath = join(root, "infra/host/autoinstall/lospor-firstboot.sh")
    const quote = value => `'${value.replaceAll("'", "''")}'`
    const compose = extra => runPowershell([
      `$r = ConvertTo-LosporSeed -Seed ([IO.File]::ReadAllText(${quote(seedPath)})) -Bootstrap ([IO.File]::ReadAllText(${quote(bootstrapPath)})) -PasswordHash '$6$salt$hash' ${extra}`,
      '"$($r.CarriesFirstboot)"',
      "[Console]::Out.Write($r.Text)",
    ].join("\n"))
    const [flag, ...text] = compose(`-Firstboot ([IO.File]::ReadAllText(${quote(firstbootPath)})) -ChosenPassword`).split("\n")
    const composed = text.join("\n")
    assert.equal(flag, "True")
    assert.doesNotMatch(composed, /lospor-kit: firstboot/)
    assert.doesNotMatch(composed, /chage -d 0 lospor/, "a password the IT person chose is not expired")
    const script = composed.match(/printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d > \/target\/usr\/local\/lib\/lospor\/lospor-firstboot\.sh/)
    assert.ok(script, "the first-boot script is not written onto the new system")
    assert.equal(Buffer.from(script[1], "base64").toString("utf8"), firstboot.replace(/\r\n/g, "\n"))
    const unit = composed.match(/printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d > \/target\/etc\/systemd\/system\/firstboot-lospor\.service/)
    assert.match(Buffer.from(unit[1], "base64").toString("utf8"), /ConditionPathExists=\/var\/lib\/lospor-firstboot\/answers\.env/)
    assert.match(composed, /mount -t vfat -o ro \/dev\/disk\/by-label\/CIDATA \/run\/lospor-answers/)
    assert.match(composed, /install -d -m 0700 \/target\/var\/lib\/lospor-firstboot/)
    assert.match(composed, /curtin in-target -- systemctl enable firstboot-lospor\.service/)
    // losporctl-install.sh takes any lospor-* service for the remains of an unfinished
    // install: a real run on Hyper-V refused to start because the unit was named that way.
    assert.match(bootstrap, /"\$systemd_dir"\/lospor-\*\.service/)
    assert.doesNotMatch(composed, /systemd\/system\/lospor-[^\s]*\.service/)
    // The answers are copied before the installed mark: the kit reads the mark as "all steps done".
    assert.ok(composed.indexOf("firstboot-lospor.service") < composed.lastIndexOf("lospor-installed"))

    const [plainFlag, ...plainText] = compose("").split("\n")
    assert.equal(plainFlag, "False")
    assert.doesNotMatch(plainText.join("\n"), /lospor-firstboot\.sh|firstboot-lospor\.service|lospor-kit: firstboot/)
    assert.match(plainText.join("\n"), /chage -d 0 lospor/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("answers are checked with the server's own rules and written as the first boot reads them", { skip: noPowershell }, () => {
  const output = runPowershell([
    '$good = @{ Locale = "bg"; ReleaseVersion = "1.4.0"; ClinicalDomain = "lospor.hospital.bg"; ResearchDomain = "lospor-research.hospital.bg"; TlsMode = "operator"; AcmeEmail = "ignored@hospital.bg"; HospitalName = "УМБАЛ Света Анна"; HospitalCity = "София"; AdminEmail = "it@hospital.bg"; AdminUsername = "it.admin"; AdminFirstName = "Иван"; AdminLastName = "Петров" }',
    '"good:" + (Test-LosporInstallAnswers $good).Count',
    '$bad = $good.Clone(); $bad.ResearchDomain = "lospor.hospital.bg"; $bad.HospitalName = "a`$(reboot)"; $bad.AdminUsername = "1admin"; $bad.TlsMode = "acme"; $bad.AcmeEmail = ""',
    '"bad:" + (((Test-LosporInstallAnswers $bad) | ForEach-Object { $_.Field }) -join ",")',
    '"password-ok:" + (Test-LosporAdminPassword "Admin phrase 1!").Count',
    '"password-weak:" + (((Test-LosporAdminPassword "password") | ForEach-Object { $_.En }) -join ";")',
    '[Console]::Out.Write((ConvertTo-LosporInstallAnswers $good))',
  ].join("\n"))
  const lines = output.split("\n")
  assert.equal(lines[0], "good:0")
  assert.equal(lines[1], "bad:ResearchDomain,AcmeEmail,HospitalName,AdminUsername")
  assert.equal(lines[2], "password-ok:0")
  assert.equal(lines[3], "password-weak:an uppercase letter;a number;a symbol")
  const answers = lines.slice(4).join("\n")
  assert.ok(answers.startsWith("LOSPOR-HOSPITAL-INSTALL-ANSWERS-V1\nLOSPOR_DEFAULT_LOCALE=bg\nLOSPOR_RELEASE_VERSION=1.4.0\n"))
  assert.match(answers, /^HOSPITAL_INSTITUTION_NAME=УМБАЛ Света Анна$/m)
  assert.doesNotMatch(answers, /ACME_EMAIL/, "a notice address is written only for Let's Encrypt")
  // Every key written is one the first boot accepts.
  const accepted = firstboot.match(/^ANSWER_KEYS="([^"]+)"/m)[1].split(" ")
  for (const line of answers.trim().split("\n").slice(1)) assert.ok(accepted.includes(line.split("=")[0]), `${line} is not accepted at first boot`)
})

test("Hyper-V's key-value items are read back as the first boot wrote them", { skip: noPowershell }, () => {
  const item = (name, data) => `<INSTANCE CLASSNAME="Msvm_KvpExchangeDataItem"><PROPERTY NAME="Data" TYPE="string"><VALUE>${data}</VALUE></PROPERTY><PROPERTY NAME="Name" TYPE="string"><VALUE>${name}</VALUE></PROPERTY><PROPERTY NAME="Source" TYPE="uint16"><VALUE>2</VALUE></PROPERTY></INSTANCE>`
  const output = runPowershell([
    `$t = ConvertFrom-LosporKvpItems @('${item("LosporInstallState", "installed")}', '${item("LosporInstallUrl", "https://lospor.hospital.bg/status/go-live")}', 'not xml')`,
    '"$($t.LosporInstallState)|$($t.LosporInstallUrl)|$($t.Count)"',
  ].join("\n"))
  assert.equal(output.trim(), "installed|https://lospor.hospital.bg/status/go-live|2")
})
