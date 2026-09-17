// Writes the release dossier into the security evidence, before that directory
// is archived. Run by the candidate build only; see release-dossier-lib.mjs.
//
//   node scripts/create-release-dossier.mjs --version X.Y.Z --commit SHA
//     --repository OWNER/REPO --run-id N --run-attempt N --created-at ISO
//     --images dist/...-images.json --deployment dist/...-deployment.tar.gz
//     --offline-part dist/...part-000 [--offline-part ...]
//     --evidence .data/release-evidence --compatibility release-compatibility.tsv
//     --exceptions release-risk-exceptions.json --upstream UPSTREAM_VERSIONS.json

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { DOSSIER_FILE, createReleaseDossier } from "./release-dossier-lib.mjs"

const options = { "offline-part": [] }
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 2) {
  const name = argv[index]?.replace(/^--/, "")
  const value = argv[index + 1]
  if (!argv[index]?.startsWith("--") || value === undefined) throw new Error(`Unexpected argument: ${argv[index]}`)
  if (name === "offline-part") options[name].push(value)
  else if (options[name] !== undefined) throw new Error(`--${name} given twice`)
  else options[name] = value
}
for (const required of ["version", "commit", "repository", "run-id", "run-attempt", "created-at", "images", "deployment", "evidence", "compatibility", "exceptions", "upstream"]) {
  if (!options[required]) throw new Error(`--${required} is required`)
}
if (options["offline-part"].length === 0) throw new Error("at least one --offline-part is required")

const json = async path => JSON.parse(await readFile(path, "utf8"))
const dossier = await createReleaseDossier({
  version: options.version,
  commit: options.commit,
  createdAt: options["created-at"],
  repository: options.repository,
  runId: options["run-id"],
  runAttempt: Number(options["run-attempt"]),
  imageLock: await json(options.images),
  deploymentArchive: options.deployment,
  offlineArchives: options["offline-part"],
  evidenceDirectory: options.evidence,
  compatibilityText: await readFile(options.compatibility, "utf8"),
  riskExceptions: await json(options.exceptions),
  upstream: await json(options.upstream),
})
const output = join(options.evidence, DOSSIER_FILE)
await writeFile(output, `${JSON.stringify(dossier, null, 2)}\n`, { flag: "wx" })
console.log(`Release dossier written: ${output}`)
