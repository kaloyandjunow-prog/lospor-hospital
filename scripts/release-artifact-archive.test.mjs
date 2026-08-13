import assert from "node:assert/strict"
import test from "node:test"
import { verifyActionsArtifactArchive } from "./release-artifact-archive-lib.mjs"

const VERSION = "1.2.3"
const prefix = `lospor-hospital-${VERSION}`

function fixture(phase = "candidate", partCount = 2) {
  const common = [
    `${prefix}-deployment.tar.gz`,
    `${prefix}-manifest.json`,
    `${prefix}-release.lock`,
    `${prefix}-release.lock.sha256`,
    `${prefix}-security-evidence.tar.gz`,
    ...Array.from({ length: partCount }, (_, index) => `${prefix}-images.tar.gz.part-${String(index).padStart(3, "0")}`),
  ]
  const phaseFiles = phase === "candidate"
    ? [`${prefix}-images.json`, `${prefix}-publication-request.tsv`]
    : []
  const members = [...common, ...phaseFiles]
  return {
    members,
    membersText: `${members.join("\n")}\n`,
    listingText: `Archive: artifact.zip\n${members.map(name => `-rw-r--r--  3.0 unx 1 b- 1 defN 26-Aug-13 00:00 ${name}`).join("\n")}\n${members.length} files\n`,
  }
}

test("accepts exact flat candidate and final archives", () => {
  for (const phase of ["candidate", "final"]) {
    const value = fixture(phase)
    assert.deepEqual(
      verifyActionsArtifactArchive({ version: VERSION, phase, ...value }),
      [...value.members].sort(),
    )
  }
})

test("rejects traversal, nested, duplicate, missing, extra and discontinuous members", () => {
  const base = fixture()
  for (const members of [
    [...base.members, "../escape"],
    [...base.members, "nested/file"],
    [...base.members, "line\tbreak"],
    [...base.members, base.members[0]],
    base.members.slice(1),
    [...base.members, "unreviewed.txt"],
    base.members.map(name => name.endsWith("part-001") ? `${prefix}-images.tar.gz.part-002` : name),
  ]) {
    assert.throws(() => verifyActionsArtifactArchive({
      version: VERSION,
      phase: "candidate",
      membersText: `${members.join("\n")}\n`,
      listingText: base.listingText,
    }), /artifact/i)
  }
})

test("rejects symlinks and duplicate ZIP metadata records", () => {
  const value = fixture("final", 1)
  const first = value.members[0]
  assert.throws(() => verifyActionsArtifactArchive({
    version: VERSION,
    phase: "final",
    membersText: value.membersText,
    listingText: value.listingText.replace(`-rw-r--r--  3.0 unx 1 b- 1 defN 26-Aug-13 00:00 ${first}`, `lrwxrwxrwx  3.0 unx 1 b- 1 stor 26-Aug-13 00:00 ${first}`),
  }), /regular file/)
  assert.throws(() => verifyActionsArtifactArchive({
    version: VERSION,
    phase: "final",
    membersText: value.membersText,
    listingText: `${value.listingText}-rw-r--r--  3.0 unx 1 b- 1 defN 26-Aug-13 00:00 ${first}\n`,
  }), /regular file/)
})
