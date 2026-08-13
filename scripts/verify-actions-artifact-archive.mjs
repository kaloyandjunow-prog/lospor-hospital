import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { verifyActionsArtifactArchive } from "./release-artifact-archive-lib.mjs"

const [version, phase, membersPath, listingPath] = process.argv.slice(2)
if (!version || !phase || !membersPath || !listingPath) {
  throw new Error("Usage: node scripts/verify-actions-artifact-archive.mjs <version> <candidate|final> <members.txt> <zipinfo.txt>")
}
const result = verifyActionsArtifactArchive({
  version,
  phase,
  membersText: await readFile(resolve(membersPath), "utf8"),
  listingText: await readFile(resolve(listingPath), "utf8"),
})
console.log(`Actions artifact archive verified: ${result.length} regular files`)
