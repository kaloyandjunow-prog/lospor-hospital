// Verifies the release dossier inside a security-evidence archive against the
// release lock, and prints it in plain lines.
//
//   node scripts/verify-release-dossier.mjs <security-evidence.tar.gz> <release.lock>
//     [--run RUN-ID --attempt N]
//
// The archive is listed before anything is extracted, and refused if an entry
// is outside release-evidence/, is a link or special file, or climbs with "..".

import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { DOSSIER_FILE, summarizeReleaseDossier, verifyReleaseDossier } from "./release-dossier-lib.mjs"

// The archive is named relative to its own directory: GNU tar reads "C:" in a
// Windows path as a remote host, and the maintainer's helper runs on Windows.
function tar(args, cwd) {
  const result = spawnSync("tar", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`Release dossier: the security evidence archive could not be read (${(result.stderr ?? "").trim()})`)
  return result.stdout.replaceAll("\r\n", "\n")
}

export async function verifyEvidenceArchive({ archive, lockPath, runId, runAttempt }) {
  const archiveDirectory = dirname(resolve(archive))
  const archiveName = basename(archive)
  const names = tar(["-tzf", archiveName], archiveDirectory).split("\n").filter(Boolean)
  for (const name of names) {
    if (!/^release-evidence(\/|$)/.test(name) || name.split("/").some(part => part === "..") || name.startsWith("/")) {
      throw new Error(`Release dossier: unsafe entry in the security evidence: ${name}`)
    }
  }
  const types = tar(["-tvzf", archiveName], archiveDirectory).split("\n").filter(Boolean)
  if (types.some(line => !["-", "d"].includes(line[0]))) throw new Error("Release dossier: the security evidence holds a link or special file")
  if (!names.includes(`release-evidence/${DOSSIER_FILE}`)) throw new Error("Release dossier: the security evidence has no release-dossier.json")
  const directory = await mkdtemp(join(tmpdir(), "lospor-dossier-"))
  try {
    tar(["-xzf", archiveName, "-C", directory], archiveDirectory)
    const evidenceDirectory = join(directory, "release-evidence")
    const dossier = JSON.parse(await readFile(join(evidenceDirectory, DOSSIER_FILE), "utf8"))
    return await verifyReleaseDossier({
      dossier,
      lockText: await readFile(lockPath, "utf8"),
      evidenceDirectory,
      ...(runId === undefined ? {} : { expectedRunId: runId, expectedRunAttempt: runAttempt }),
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function main() {
  const [archive, lockPath, ...rest] = process.argv.slice(2)
  let runId
  let runAttempt
  for (let index = 0; index < rest.length; index += 2) {
    if (rest[index] === "--run" && rest[index + 1]) runId = rest[index + 1]
    else if (rest[index] === "--attempt" && rest[index + 1]) runAttempt = rest[index + 1]
    else throw new Error("Usage: node scripts/verify-release-dossier.mjs <security-evidence.tar.gz> <release.lock> [--run RUN-ID --attempt N]")
  }
  if (!archive || !lockPath || (runId === undefined) !== (runAttempt === undefined)) {
    throw new Error("Usage: node scripts/verify-release-dossier.mjs <security-evidence.tar.gz> <release.lock> [--run RUN-ID --attempt N]")
  }
  const dossier = await verifyEvidenceArchive({ archive, lockPath, runId, runAttempt })
  console.log("Release dossier verified against the release lock:")
  for (const line of summarizeReleaseDossier(dossier)) console.log(`  ${line}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
