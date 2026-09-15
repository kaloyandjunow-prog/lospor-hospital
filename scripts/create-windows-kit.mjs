// The Windows kit a hospital downloads: one small zip with the wizard, the
// Hyper-V kit, Ubuntu's setup file, the first-boot installer and the LOSPOR
// installer the server runs. Extracted beside an offline release's files, the
// wizard installs from them; on its own, the server downloads the release.
//
//   node scripts/create-windows-kit.mjs <version> <output-directory>
//
// Writes lospor-hospital-<version>-windows-kit.zip and its .sha256. The zip is
// deterministic (fixed times, fixed order), so the same commit and version
// always give the same bytes. Windows' "Extract All" reads it without
// anything installed.

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateRawSync } from "node:zlib"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** In the zip, from the repository. Line endings as each reader needs them. */
export const WINDOWS_KIT_FILES = [
  { path: "Install LOSPOR Hospital.cmd", source: "infra/host/windows-kit/Install LOSPOR Hospital.cmd", eol: "crlf" },
  { path: "README.txt", source: "infra/host/windows-kit/README.txt", eol: "crlf" },
  { path: "infra/host/hyperv/Install-LosporHospital.ps1", source: "infra/host/hyperv/Install-LosporHospital.ps1", eol: "crlf" },
  { path: "infra/host/hyperv/New-LosporHospitalVm.ps1", source: "infra/host/hyperv/New-LosporHospitalVm.ps1", eol: "crlf" },
  { path: "infra/host/hyperv/LosporHostKit.ps1", source: "infra/host/hyperv/LosporHostKit.ps1", eol: "crlf" },
  { path: "infra/host/autoinstall/user-data", source: "infra/host/autoinstall/user-data", eol: "lf" },
  { path: "infra/host/autoinstall/lospor-firstboot.sh", source: "infra/host/autoinstall/lospor-firstboot.sh", eol: "lf" },
  { path: "scripts/losporctl-install.sh", source: "scripts/losporctl-install.sh", eol: "lf" },
]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// 2026-01-01 00:00 in MS-DOS time: a zip entry has no earlier epoch to use.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

export function zipEntries(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { path, data } of entries) {
    const name = Buffer.from(path, "utf8")
    const compressed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // names are UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export function windowsKitEntries(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Not a release version: ${version}`)
  const entries = WINDOWS_KIT_FILES.map(({ path, source, eol }) => {
    let text = readFileSync(join(root, source), "utf8").replace(/\r\n/g, "\n")
    if (eol === "crlf") text = text.replace(/\n/g, "\r\n")
    // A byte-order mark, where the file has one, is kept: Windows PowerShell 5.1
    // needs it to read Bulgarian text.
    return { path, data: Buffer.from(text, "utf8") }
  })
  entries.push({ path: "RELEASE-VERSION", data: Buffer.from(`${version}\r\n`) })
  return entries
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, outputArg] = process.argv.slice(2)
  if (!version || !outputArg) throw new Error("Usage: node scripts/create-windows-kit.mjs <version> <output-directory>")
  const name = `lospor-hospital-${version}-windows-kit.zip`
  const zip = zipEntries(windowsKitEntries(version))
  const output = join(resolve(outputArg), name)
  writeFileSync(output, zip, { flag: "wx" })
  writeFileSync(`${output}.sha256`, `${createHash("sha256").update(zip).digest("hex")}  ${name}\n`, { flag: "wx" })
  console.log(`Windows kit written: ${output}`)
}
