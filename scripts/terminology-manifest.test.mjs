import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { parseTerminologyManifest, verifyTerminologyPackage } from "./terminology-manifest.mjs"

const roles = [
  ["VOCABULARY.csv", "vocabulary"],
  ["DOMAIN.csv", "domain"],
  ["CONCEPT.csv", "concept"],
  ["CONCEPT_RELATIONSHIP.csv", "relationship"],
  ["CONCEPT_ANCESTOR.csv", "ancestor"],
  ["CONCEPT_SYNONYM.csv", "synonym"],
  ["ICD10_BG.xlsx", "bulgarianIcd"],
]
const digest = bytes => createHash("sha256").update(bytes).digest("hex")

function manifest(files) {
  return {
    schemaVersion: 1,
    packageId: "hospital-approved-2026",
    version: "2026.08",
    source: { name: "Approved test source", reference: "contract fixture" },
    licence: { identifier: "TEST-LICENCE", approvedBy: "Hospital committee", approvedAt: "2026-08-01" },
    files,
    expectations: {
      minimumRows: {
        icd10Codes: 1, icd10BulgarianLabels: 1, atcCodes: 1, labLoinc: 1,
        omopConcepts: 1, omopRelationships: 1, omopAncestors: 1, conceptMaps: 1,
      },
      requireRelationshipIntegrity: true,
      requireMappedConcepts: true,
    },
  }
}

test("verifies every exact package byte and emits provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lospor-terminology-"))
  try {
    const files = []
    for (const [path, role] of roles) {
      const bytes = Buffer.from(`fixture:${path}\n`)
      await writeFile(join(directory, path), bytes)
      files.push({ path, role, required: true, sha256: digest(bytes) })
    }
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest(files)))
    const evidence = await verifyTerminologyPackage(join(directory, "manifest.json"), new Date("2026-08-22T00:00:00Z"))
    assert.equal(evidence.files.length, roles.length)
    assert.equal(evidence.verifiedAt, "2026-08-22T00:00:00.000Z")
    assert.match(evidence.manifestSha256, /^[a-f0-9]{64}$/)
    const futureApproval = manifest(files)
    futureApproval.licence.approvedAt = "2026-09-01"
    await writeFile(join(directory, "manifest.json"), JSON.stringify(futureApproval))
    await assert.rejects(
      verifyTerminologyPackage(join(directory, "manifest.json"), new Date("2026-08-22T00:00:00Z")),
      /future/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects checksum drift and unlisted files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lospor-terminology-"))
  try {
    const files = []
    for (const [path, role] of roles) {
      const bytes = Buffer.from(path)
      await writeFile(join(directory, path), bytes)
      files.push({ path, role, required: true, sha256: digest(bytes) })
    }
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest(files)))
    await writeFile(join(directory, "CONCEPT.csv"), "changed")
    await assert.rejects(verifyTerminologyPackage(join(directory, "manifest.json")), /checksum mismatch/)
    await writeFile(join(directory, "CONCEPT.csv"), "CONCEPT.csv")
    await writeFile(join(directory, "unlisted.txt"), "no")
    await assert.rejects(verifyTerminologyPackage(join(directory, "manifest.json")), /exactly match/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects directories, symbolic links, and multiply-linked source bytes", async t => {
  const directory = await mkdtemp(join(tmpdir(), "lospor-terminology-"))
  const outside = await mkdtemp(join(tmpdir(), "lospor-terminology-outside-"))
  try {
    const files = []
    for (const [path, role] of roles) {
      const bytes = Buffer.from(path)
      await writeFile(join(directory, path), bytes)
      files.push({ path, role, required: true, sha256: digest(bytes) })
    }
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest(files)))

    await mkdir(join(directory, "unlisted-directory"))
    await assert.rejects(
      verifyTerminologyPackage(join(directory, "manifest.json")),
      /non-regular entry/,
    )
    await rm(join(directory, "unlisted-directory"), { recursive: true })

    const linkedSource = join(outside, "linked-CONCEPT.csv")
    await writeFile(linkedSource, "CONCEPT.csv")
    await rm(join(directory, "CONCEPT.csv"))
    await link(linkedSource, join(directory, "CONCEPT.csv"))
    await assert.rejects(
      verifyTerminologyPackage(join(directory, "manifest.json")),
      /singly-linked/,
    )
    await rm(join(directory, "CONCEPT.csv"))
    await writeFile(join(directory, "CONCEPT.csv"), "CONCEPT.csv")

    const symbolicSource = join(outside, "symbolic-CONCEPT.csv")
    await writeFile(symbolicSource, "CONCEPT.csv")
    await rm(join(directory, "CONCEPT.csv"))
    try {
      await symlink(symbolicSource, join(directory, "CONCEPT.csv"), "file")
      await assert.rejects(
        verifyTerminologyPackage(join(directory, "manifest.json")),
        /non-regular entry|singly-linked/,
      )
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error
      t.diagnostic("symbolic-link assertion skipped: this platform denied symlink creation")
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test("requires the complete canonical import order and positive expectations", () => {
  const files = roles.map(([path, role]) => ({ path, role, required: true, sha256: "a".repeat(64) }))
  const missing = manifest(files.filter(file => file.role !== "ancestor"))
  assert.throws(() => parseTerminologyManifest(missing), /CONCEPT_ANCESTOR/)
  const invalid = manifest(files)
  invalid.expectations.minimumRows.atcCodes = 0
  assert.throws(() => parseTerminologyManifest(invalid), /positive integer/)
  const invalidVersion = manifest(files)
  invalidVersion.version = "unsafe|version"
  assert.throws(() => parseTerminologyManifest(invalidVersion), /version is invalid/)
  const invalidDate = manifest(files)
  invalidDate.licence.approvedAt = "2026-02-31"
  assert.throws(() => parseTerminologyManifest(invalidDate), /real calendar date/)
})
