import { readFile } from "node:fs/promises"
import { assertReleaseWorkflowContract } from "./release-workflow-contract-lib.mjs"

const [release, publish, quality] = await Promise.all([
  readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/publish-release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8"),
])
assertReleaseWorkflowContract(release, publish, quality)
console.log("Tag-built candidate, manual integrity-only publication and clinical release gates are intact.")
