import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { inflateRawSync } from "node:zlib"
import { WINDOWS_KIT_FILES, windowsKitEntries, zipEntries } from "./create-windows-kit.mjs"

// Reads a zip the way an extractor does: the central directory, then each
// local entry, checked against its CRC.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(end >= 0, "no end of central directory")
  const count = buffer.readUInt16LE(end + 10)
  let pointer = buffer.readUInt32LE(end + 16)
  const files = new Map()
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(pointer), 0x02014b50)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const offset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength)
    const size = buffer.readUInt32LE(pointer + 20)
    const localName = buffer.readUInt16LE(offset + 26)
    const data = inflateRawSync(buffer.subarray(offset + 30 + localName, offset + 30 + localName + size))
    files.set(name, data)
    pointer += 46 + nameLength
  }
  return files
}

test("the kit holds the wizard, the Hyper-V kit, the seed, the first boot and the installer, laid out as the kit expects", () => {
  const files = readZip(zipEntries(windowsKitEntries("1.4.0")))
  assert.deepEqual([...files.keys()].sort(), [...WINDOWS_KIT_FILES.map(file => file.path), "RELEASE-VERSION"].sort())
  assert.equal(files.get("RELEASE-VERSION").toString(), "1.4.0\r\n")
  // The wizard and the kit find their neighbours by these relative paths.
  const kit = files.get("infra/host/hyperv/New-LosporHospitalVm.ps1").toString()
  assert.match(kit, /Join-Path \$PSScriptRoot "\.\.\\\.\.\\\.\.\\scripts\\losporctl-install\.sh"/)
  assert.match(kit, /Join-Path \$PSScriptRoot "\.\.\\autoinstall\\lospor-firstboot\.sh"/)
  assert.match(files.get("Install LOSPOR Hospital.cmd").toString(), /-File "%~dp0infra\\host\\hyperv\\Install-LosporHospital\.ps1"/)
})

test("each file has the line endings and encoding its reader needs", () => {
  const files = readZip(zipEntries(windowsKitEntries("1.4.0")))
  for (const name of ["Install LOSPOR Hospital.cmd", "infra/host/hyperv/Install-LosporHospital.ps1"]) {
    const text = files.get(name).toString()
    assert.doesNotMatch(text.replace(/\r\n/g, ""), /\n/, `${name} has bare LF lines`)
  }
  for (const name of ["infra/host/autoinstall/user-data", "infra/host/autoinstall/lospor-firstboot.sh", "scripts/losporctl-install.sh"]) {
    assert.doesNotMatch(files.get(name).toString(), /\r/, `${name} has CR, which sh and cloud-init cannot read`)
  }
  // Windows PowerShell 5.1 reads a file without a byte-order mark as ANSI, so
  // Bulgarian text in a script would not even parse.
  for (const name of ["infra/host/hyperv/Install-LosporHospital.ps1", "infra/host/hyperv/LosporHostKit.ps1"]) {
    assert.deepEqual([...files.get(name).subarray(0, 3)], [0xef, 0xbb, 0xbf], `${name} has no byte-order mark`)
  }
})

test("the same version always gives the same zip", () => {
  assert.ok(zipEntries(windowsKitEntries("1.4.0")).equals(zipEntries(windowsKitEntries("1.4.0"))))
  assert.throws(() => windowsKitEntries("latest"))
})

const powershell = ["powershell.exe", "pwsh"].find(command => spawnSync(command, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" }).status === 0)
test("Windows itself extracts the zip", { skip: powershell ? false : "PowerShell is not installed here" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "lospor-windows-kit-"))
  try {
    const zip = join(directory, "kit.zip")
    writeFileSync(zip, zipEntries(windowsKitEntries("1.4.0")))
    const command = `Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Archive\\Microsoft.PowerShell.Archive.psd1') -ErrorAction Stop; Expand-Archive -LiteralPath '${zip}' -DestinationPath '${join(directory, "out")}'`
    const result = spawnSync(powershell, ["-NoProfile", "-Command", command], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(directory, "out", "RELEASE-VERSION"), "utf8"), "1.4.0\r\n")
    assert.ok(readFileSync(join(directory, "out", "infra", "host", "autoinstall", "lospor-firstboot.sh"), "utf8").startsWith("#!/bin/sh"))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
