import { readFile } from "node:fs/promises"
import { assertReleaseWorkflowContract } from "./release-workflow-contract-lib.mjs"

const [release, quality] = await Promise.all([
  readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8"),
])
assertReleaseWorkflowContract(release, quality)
console.log("Release workflow ordering, retry, signing, offline and clinical gates are intact.")
