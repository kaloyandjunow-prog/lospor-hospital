import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { requireExplicitVulnerabilityReview, supplementalCycloneDx, verifyPostgresSourceRecords } from "./postgres-source-provenance.mjs"
import { reviewedInputsFingerprint } from "./release-inputs.mjs"

const sha256 = value => createHash("sha256").update(value).digest("hex")

function fixture() {
  const components = {
    postgresql: { version: "17.11", url: "https://example.invalid/postgresql.tar.bz2", sha256: "1".repeat(64) },
    zlib: { version: "1.3.2", url: "https://example.invalid/zlib.tar.xz", sha256: "2".repeat(64) },
    acl: { version: "2.4.0", url: "https://example.invalid/acl.tar.xz", sha256: "3".repeat(64) },
  }
  const flags = ["--prefix=/opt/lospor-postgresql", "--without-ldap", "--without-libxml"]
  const packageLines = [
    "bison=1", "build-essential=1", "flex=1", "gcc=1", "libicu-dev:amd64=1", "libssl-dev:amd64=1", "make=1",
    ...Array.from({ length: 100 }, (_, index) => `package-${String(index).padStart(3, "0")}=1`),
  ].sort()
  const records = {
    sources: Buffer.from([
      "debian=http://snapshot.debian.org/archive/debian/20260803T000000Z",
      "debian-security=http://snapshot.debian.org/archive/debian-security/20260803T000000Z",
      ...Object.entries(components).map(([name, component]) => `${name}=${component.url} sha256:${component.sha256}`),
      "",
    ].join("\n")),
    configure: Buffer.from(`${flags.map(flag => ` '${flag}'`).join("")}\n`),
    compiler: Buffer.from("gcc (Debian 12.2.0-1) 12.2.0\ntext\nGNU ld (GNU Binutils for Debian) 2.40\ntext\n"),
    builderPackages: Buffer.from(`${packageLines.join("\n")}\n`),
  }
  const inputs = {
    schemaVersion: 3,
    platform: "linux/amd64",
    images: {
      node: `node:24-alpine3.24@sha256:${"1".repeat(64)}`,
      nginx: `nginx:1.30.4-alpine@sha256:${"2".repeat(64)}`,
      postgres: `postgres:17.11-bookworm@sha256:${"3".repeat(64)}`,
      caddyBuilder: `golang:1.26.6-alpine3.24@sha256:${"4".repeat(64)}`,
      caddyRuntime: `caddy:2.11.4-alpine@sha256:${"5".repeat(64)}`,
      curl: `curlimages/curl:8.21.0@sha256:${"6".repeat(64)}`,
      trivy: `aquasec/trivy:0.74.0@sha256:${"7".repeat(64)}`,
    },
    postgresSource: {
      debianSnapshot: "20260803T000000Z",
      components,
      postgresqlConfigure: flags,
      embeddedRecordSha256: Object.fromEntries(Object.entries(records).map(([name, bytes]) => [name, sha256(bytes)])),
      vulnerabilityReview: { status: "blocked-pending-explicit-review" },
    },
  }
  return { inputs, records }
}

test("accepts only the exact embedded source, configure, compiler and package records", () => {
  const { inputs, records } = fixture()
  assert.equal(verifyPostgresSourceRecords(records, inputs).components.zlib.version, "1.3.2")
  const tampered = { ...records, sources: Buffer.concat([records.sources, Buffer.from("tampered")]) }
  assert.throws(() => verifyPostgresSourceRecords(tampered, inputs), /does not match release inputs/)
})

test("supplemental CycloneDX records all omitted custom components without claiming Trivy coverage", () => {
  const { inputs, records } = fixture()
  const source = verifyPostgresSourceRecords(records, inputs)
  const bom = supplementalCycloneDx(source, { configDigest: `sha256:${"a".repeat(64)}` }, "candidate")
  assert.deepEqual(bom.components.map(component => component.name), ["postgresql", "zlib", "acl"])
  assert.equal(bom.metadata.properties.find(property => property.name === "org.lospor:vulnerability-coverage").value,
    "provenance-only; not vulnerability-mapped by Trivy")
})

test("release stays blocked until a narrow release-specific source vulnerability decision is supplied", () => {
  const { inputs } = fixture()
  assert.throws(() => requireExplicitVulnerabilityReview("1.0.0", inputs), /Release 1\.0\.0 is blocked/)
  const reviewed = structuredClone(inputs)
  reviewed.postgresSource.vulnerabilityReview = {
    status: "accepted-provenance-only",
    release: "1.0.0",
    reviewedAt: "2026-08-14",
    rationale: "A named reviewer examined exact upstream security records for all three tarballs.",
    evidenceUrls: ["https://example.invalid/exact-review-evidence"],
  }
  assert.equal(requireExplicitVulnerabilityReview("1.0.0", reviewed).status, "accepted-provenance-only")
  // A review naming an earlier release and carrying no fingerprint cannot be
  // shown to still apply, so it still blocks.
  assert.throws(() => requireExplicitVulnerabilityReview("1.0.1", reviewed), /Release 1\.0\.1 is blocked/)
})

test("a review carries forward only while the source inputs it was made against are unchanged", () => {
  const { inputs } = fixture()
  const reviewed = structuredClone(inputs)
  reviewed.postgresSource.vulnerabilityReview = {
    status: "accepted-provenance-only",
    release: "1.0.0",
    reviewedAt: "2026-08-14",
    rationale: "A named reviewer examined exact upstream security records for all three tarballs.",
    evidenceUrls: ["https://example.invalid/exact-review-evidence"],
    reviewedSourceFingerprint: reviewedInputsFingerprint(reviewed),
  }

  // Same release: reviewed directly.
  assert.equal(
    requireExplicitVulnerabilityReview("1.0.0", reviewed).basis,
    "reviewed-for-this-release",
  )

  // Later release, byte-identical sources: the carry-forward every release
  // since 1.1.0 has claimed in prose, now actually verified. This is the case
  // that used to need a hand-edited version string, and whose omission failed
  // a candidate build twenty minutes in.
  assert.equal(
    requireExplicitVulnerabilityReview("1.0.1", reviewed).basis,
    "carried-forward-unchanged-sources",
  )

  // Any material change to what gets built must force a fresh decision.
  for (const mutate of [
    draft => { draft.postgresSource.components.zlib.version = "9.9.9" },
    draft => { draft.postgresSource.components.zlib.sha256 = "b".repeat(64) },
    draft => { draft.postgresSource.components.postgresql.url = "https://example.invalid/moved.tar.bz2" },
    draft => { draft.postgresSource.debianSnapshot = "20260101T000000Z" },
    draft => { draft.postgresSource.postgresqlConfigure.push("--with-something-new") },
    // The recorded rationale rests on "the same pinned base images" as well as
    // the same source tarballs, so a moved base image digest must invalidate
    // the carry-forward too. Covering only postgresSource left that half of the
    // claim unchecked.
    draft => { draft.images.node = draft.images.node.replace(/sha256:[a-f0-9]{64}/, `sha256:${"c".repeat(64)}`) },
    draft => { draft.images.postgres = draft.images.postgres.replace(/sha256:[a-f0-9]{64}/, `sha256:${"d".repeat(64)}`) },
  ]) {
    const changed = structuredClone(reviewed)
    mutate(changed)
    assert.throws(
      () => requireExplicitVulnerabilityReview("1.0.1", changed),
      /source inputs changed since the review recorded for 1\.0\.0/,
      "a changed source input must not carry an earlier review forward",
    )
  }
})

test("the source fingerprint ignores formatting but not substance", () => {
  const { inputs } = fixture()
  const baseline = reviewedInputsFingerprint(inputs)

  // Key order is not substance.
  const reordered = structuredClone(inputs)
  reordered.postgresSource.components = Object.fromEntries(
    Object.entries(reordered.postgresSource.components).reverse(),
  )
  assert.equal(reviewedInputsFingerprint(reordered), baseline)

  // Recording a review is not substance either, or every review would
  // invalidate itself.
  const annotated = structuredClone(inputs)
  annotated.postgresSource.vulnerabilityReview = {
    status: "accepted-provenance-only",
    release: "1.0.0",
    reviewedAt: "2026-08-14",
    rationale: "A named reviewer examined exact upstream security records for all three tarballs.",
    evidenceUrls: ["https://example.invalid/exact-review-evidence"],
  }
  assert.equal(reviewedInputsFingerprint(annotated), baseline)
})
