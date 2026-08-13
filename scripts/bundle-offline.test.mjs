import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmod, cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

const repository = resolve(import.meta.dirname, "..")
const bash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash"
const version = "1.0.0"
const prefix = `lospor-hospital-${version}-images.tar.gz.part-`

async function writeExecutable(path, contents) {
  await writeFile(path, contents)
  await chmod(path, 0o755)
}

function toBashPath(path) {
  if (process.platform !== "win32") return path
  const converted = spawnSync(bash, ["-lc", 'cygpath -u "$1"', "_", path], { encoding: "utf8" })
  assert.equal(converted.status, 0, converted.stderr)
  return converted.stdout.trim()
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "hospital-offline-bundle-"))
  const fakeBin = join(directory, "fake-bin")
  await mkdir(join(directory, "scripts"), { recursive: true })
  await mkdir(fakeBin)
  await cp(join(repository, "scripts", "bundle-offline.sh"), join(directory, "scripts", "bundle-offline.sh"))
  await chmod(join(directory, "scripts", "bundle-offline.sh"), 0o755)
  await writeFile(join(directory, "image-lock.json"), "{}\n")

  await writeExecutable(join(fakeBin, "node"), `#!/bin/bash
set -euo pipefail
[[ "\${1:-}" == scripts/image-lock.mjs ]]
case "\${2:-}" in
  verify-loaded-lock) exit 0 ;;
  refs)
    for index in {0..9}; do
      printf 'registry.invalid/hospital-image-%02d:${version}\\tregistry.invalid/hospital-image-%02d@sha256:%064d\\tsha256:%064d\\n' \
        "$index" "$index" "$((index + 1))" "$((index + 11))"
    done
    ;;
  *) exit 64 ;;
esac
`)
  await writeExecutable(join(fakeBin, "docker"), `#!/bin/bash
set -euo pipefail
[[ "\${1:-}" == save ]]
printf 'fake docker archive bytes\\n'
if [[ "\${FAKE_TOOL_MODE:-}" == docker ]]; then
  exit 71
fi
`)
  const fakeEnvironment = join(directory, "fake-environment.sh")
  await writeFile(fakeEnvironment, `gzip() {
  if [[ "\${FAKE_TOOL_MODE:-}" == gzip ]]; then
    return 72
  fi
  "\${REAL_GZIP:?}" "$@"
}
split() {
  if [[ "\${FAKE_TOOL_MODE:-}" == split ]]; then
    cat >/dev/null
    return 73
  fi
  "\${REAL_SPLIT:?}" "$@"
  if [[ "\${FAKE_TOOL_MODE:-}" == corrupt ]]; then
    output_prefix="\${!#}"
    printf 'corrupt' >> "\${output_prefix}000"
  fi
}
export -f gzip split
`)

  t.after(() => rm(directory, { recursive: true, force: true }))
  return {
    directory,
    fakeBin: toBashPath(fakeBin),
    fakeEnvironment: toBashPath(fakeEnvironment),
  }
}

async function runBundle(t, mode = "success") {
  const f = await fixture(t)
  const result = spawnSync(bash, ["scripts/bundle-offline.sh", version, "image-lock.json"], {
    cwd: f.directory,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${f.fakeBin}:/usr/bin:/bin`,
      REAL_GZIP: "/usr/bin/gzip",
      REAL_SPLIT: "/usr/bin/split",
      FAKE_TOOL_MODE: mode,
      BASH_ENV: f.fakeEnvironment,
    },
  })
  const entries = await readdir(join(f.directory, "dist"))
  return { result, entries }
}

test("streams and publishes a validated offline bundle", async t => {
  const { result, entries } = await runBundle(t)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(entries, [`${prefix}000`])
})

for (const mode of ["docker", "gzip", "split", "corrupt"]) {
  test(`leaves no final parts when ${mode} faults`, async t => {
    const { result, entries } = await runBundle(t, mode)
    assert.notEqual(result.status, 0, `fault ${mode} unexpectedly succeeded`)
    assert.deepEqual(entries, [], `fault ${mode} exposed a final or staging part`)
  })
}
