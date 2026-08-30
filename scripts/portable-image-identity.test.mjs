import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import {
  parseDockerArchiveIdentity,
  parseRegistryDescriptorDigest,
  parseRegistryImageIdentity,
  samePortableIdentity,
  trivyArtifactId,
  trivyCycloneDxRootPurl,
} from "./portable-image-identity.mjs"

const names = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]
const digest = character => `sha256:${character.repeat(64)}`
const numberedDigest = number => `sha256:${number.toString(16).padStart(2, "0").repeat(32)}`

function configFixture(diffIds = [digest("a"), digest("b")]) {
  const bytes = Buffer.from(JSON.stringify({ architecture: "amd64", os: "linux", rootfs: { type: "layers", diff_ids: diffIds } }))
  const configDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  return { bytes, configDigest, diffIds }
}

test("portable identity is unchanged when different engines expose different local Docker IDs", () => {
  const config = configFixture()
  const reference = "ghcr.io/kaloyandjunow-prog/lospor-hospital-api:candidate-test"
  const configPath = `${config.configDigest.slice(7)}.json`
  const manifestBytes = Buffer.from(JSON.stringify([{ Config: configPath, RepoTags: [reference], Layers: [] }]))
  const first = parseDockerArchiveIdentity({
    manifestBytes,
    configBytes: config.bytes,
    reference,
    inspect: { Id: digest("1"), Os: "linux", Architecture: "amd64", RootFS: { Layers: config.diffIds } },
  })
  const second = parseDockerArchiveIdentity({
    manifestBytes,
    configBytes: config.bytes,
    reference,
    inspect: { Id: digest("2"), Os: "linux", Architecture: "amd64", RootFS: { Layers: config.diffIds } },
  })
  assert.notEqual(first.localDockerId, second.localDockerId)
  assert.equal(samePortableIdentity(first, second), true)
  assert.equal(first.configDigest, config.configDigest)
})

test("registry identity binds top index, linux/amd64 platform manifest, and config digest", () => {
  const platformManifest = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: { digest: digest("c"), size: 10, mediaType: "application/vnd.oci.image.config.v1+json" },
    layers: [{ digest: digest("d"), size: 10, mediaType: "application/vnd.oci.image.layer.v1.tar+gzip" }],
  }))
  const platformDigest = `sha256:${createHash("sha256").update(platformManifest).digest("hex")}`
  const index = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      { digest: platformDigest, platform: { os: "linux", architecture: "amd64" } },
      { digest: digest("e"), platform: { os: "linux", architecture: "arm64" } },
    ],
  }))
  const registryDigest = `sha256:${createHash("sha256").update(index).digest("hex")}`
  const parsed = parseRegistryImageIdentity({ registryDigest, topBytes: index, platformBytes: platformManifest })
  assert.deepEqual(parsed, {
    registryDigest,
    platformManifestDigest: platformDigest,
    configDigest: digest("c"),
    platform: "linux/amd64",
  })
  assert.throws(() => parseRegistryImageIdentity({ registryDigest: digest("f"), topBytes: index, platformBytes: platformManifest }), /do not match/)
  assert.equal(parseRegistryDescriptorDigest(JSON.stringify({ digest: registryDigest })), registryDigest)
  assert.throws(() => parseRegistryDescriptorDigest(JSON.stringify({ digest: platformDigest.toUpperCase() })), /lowercase SHA-256/)
})

test("Trivy 0.74 identity formulas use same-host ImageID and normalized repository context", () => {
  const localDockerId = digest("7")
  const reference = "ghcr.io/kaloyandjunow-prog/lospor-hospital-api:candidate-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1-ffffffffffffffff"
  const expectedArtifact = `sha256:${createHash("sha256").update(`${localDockerId}:ghcr.io/kaloyandjunow-prog/lospor-hospital-api`).digest("hex")}`
  assert.equal(trivyArtifactId(localDockerId, reference), expectedArtifact)
  assert.equal(
    trivyCycloneDxRootPurl(localDockerId, reference),
    `pkg:oci/lospor-hospital-api@${localDockerId}?arch=amd64&repository_url=ghcr.io%2Fkaloyandjunow-prog%2Flospor-hospital-api`,
  )
})

async function writeExecutable(path, contents) {
  await writeFile(path, contents)
  await chmod(path, 0o755)
}

test("rollback resolves untagged content by portable identity instead of locked local IDs", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hospital-portable-rollback-"))
  const fakeBin = join(directory, "bin")
  await mkdir(fakeBin)
  const config = configFixture([digest("8"), digest("9")])
  const configPath = `${config.configDigest.slice(7)}.json`
  const state = join(directory, "docker-state.tsv")
  const oldSubjects = names.map((_, index) => numberedDigest(index + 1))
  const rows = [
    ...names.map((name, index) => `${oldSubjects[index]}\t${numberedDigest(index + 11)}\tlinux/amd64\t${config.diffIds.join(",")}`),
    ...names.map((name, index) => `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:1.0.0\t${numberedDigest(index + 31)}\tlinux/amd64\t${digest("f")}`),
  ]
  await writeFile(state, `${rows.join("\n")}\n`)
  await writeExecutable(join(fakeBin, "docker"), `#!/bin/sh
set -eu
state="\${FAKE_DOCKER_STATE:?}"
case "\${1:-} \${2:-}" in
  "image inspect")
    format="\${4:-}"; subject="\${5:-}"
    record="$(awk -F '\t' -v subject="$subject" '$1 == subject { print; exit }' "$state")"
    test -n "$record" || exit 1
    old_ifs="$IFS"; IFS="$(printf '\t')"; set -- $record; IFS="$old_ifs"
    case "$format" in
      *Architecture*) printf '%s\n' "$3" ;;
      *RootFS*) printf '%s\n' "$4" ;;
      *) exit 64 ;;
    esac
    ;;
  "image save") printf 'archive' ;;
  "image ls") awk -F '\t' '$1 ~ /^sha256:/ { print $1 }' "$state" ;;
  "tag "*)
    source="\${2:-}"; reference="\${3:-}"
    record="$(awk -F '\t' -v source="$source" '$1 == source { print; exit }' "$state")"
    test -n "$record" || exit 1
    temporary="$state.tmp.$$"
    awk -F '\t' -v reference="$reference" '$1 != reference' "$state" > "$temporary"
    printf '%s\t%s\n' "$reference" "${config.configDigest}\tlinux/amd64\t${config.diffIds.join(",")}" >> "$temporary"
    mv "$temporary" "$state"
    ;;
  *) exit 64 ;;
esac
`)
  await writeExecutable(join(fakeBin, "tar"), `#!/bin/sh
set -eu
case "\${1:-}" in
  -tf) printf '%s\n' '${configPath}' ;;
  -xOf) printf '%s' '${config.bytes.toString("utf8")}' ;;
  *) exit 64 ;;
esac
`)
  const lock = join(directory, "release.lock")
  const lines = names.map((name, index) => [
    "image",
    name,
    `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:1.0.0`,
    digest("a"),
    digest("b"),
    config.configDigest,
    "linux/amd64",
    config.diffIds.join(","),
  ].join("\t"))
  await writeFile(lock, `${lines.join("\n")}\n`)
  const result = spawnSync("sh", [resolve("scripts/verify-loaded-release-images.sh"), lock, "restore-tags"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_DOCKER_STATE: state },
  })
  assert.equal(result.status, 0, result.stderr)
  const restored = await readFile(state, "utf8")
  for (const name of names) {
    assert.match(restored, new RegExp(`^ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:1\\.0\\.0\\t${config.configDigest}`, "m"))
  }
})
