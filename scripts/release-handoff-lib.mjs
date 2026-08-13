export const HANDOFF_HEADER = "LOSPOR-HOSPITAL-PUBLICATION-REQUEST-V1"
export const OFFICIAL_REPOSITORY = "kaloyandjunow-prog/lospor-hospital"
export const CANDIDATE_WORKFLOW = ".github/workflows/release.yml"

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const COMMIT = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const POSITIVE_INTEGER = /^[1-9]\d*$/

export function validateReleaseHandoff(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("publication request must be an object")
  const expected = ["repository", "workflow", "runId", "runAttempt", "version", "tag", "commit", "lockFile", "lockBytes", "lockSha256"]
  const actual = Object.keys(value).sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    throw new Error("publication request has unexpected or missing fields")
  }
  if (value.repository !== OFFICIAL_REPOSITORY) throw new Error("publication request repository is not official")
  if (value.workflow !== CANDIDATE_WORKFLOW) throw new Error("publication request workflow is not the candidate workflow")
  const runId = String(value.runId)
  const runAttempt = String(value.runAttempt)
  if (!POSITIVE_INTEGER.test(runId) || !Number.isSafeInteger(Number(runId))) throw new Error("publication request run ID is invalid")
  if (!POSITIVE_INTEGER.test(runAttempt) || !Number.isSafeInteger(Number(runAttempt))) throw new Error("publication request run attempt is invalid")
  if (typeof value.version !== "string" || !VERSION.test(value.version)) throw new Error("publication request version is invalid")
  if (value.tag !== `hospital-${value.version}`) throw new Error("publication request tag does not match its version")
  if (typeof value.commit !== "string" || !COMMIT.test(value.commit)) throw new Error("publication request commit is invalid")
  if (value.lockFile !== `lospor-hospital-${value.version}-release.lock`) throw new Error("publication request lock filename is invalid")
  if (!Number.isSafeInteger(Number(value.lockBytes)) || Number(value.lockBytes) < 1) throw new Error("publication request lock size is invalid")
  if (typeof value.lockSha256 !== "string" || !SHA256.test(value.lockSha256)) throw new Error("publication request lock SHA-256 is invalid")
  return Object.freeze({
    repository: value.repository,
    workflow: value.workflow,
    runId,
    runAttempt,
    version: value.version,
    tag: value.tag,
    commit: value.commit,
    lockFile: value.lockFile,
    lockBytes: Number(value.lockBytes),
    lockSha256: value.lockSha256,
  })
}

export function serializeReleaseHandoff(value) {
  const handoff = validateReleaseHandoff(value)
  return `${[
    HANDOFF_HEADER,
    ["repository", handoff.repository].join("\t"),
    ["workflow", handoff.workflow].join("\t"),
    ["run", handoff.runId, handoff.runAttempt].join("\t"),
    ["release", handoff.version, handoff.tag, handoff.commit].join("\t"),
    ["lock", handoff.lockFile, handoff.lockBytes, handoff.lockSha256].join("\t"),
  ].join("\n")}\n`
}

export function parseReleaseHandoff(text) {
  if (typeof text !== "string" || !text.endsWith("\n") || text.includes("\r")) throw new Error("publication request is not canonical LF text")
  const lines = text.slice(0, -1).split("\n")
  if (lines.length !== 6 || lines[0] !== HANDOFF_HEADER) throw new Error("publication request header or record count is invalid")
  const records = lines.slice(1).map(line => line.split("\t"))
  if (records[0].length !== 2 || records[0][0] !== "repository") throw new Error("publication request repository record is invalid")
  if (records[1].length !== 2 || records[1][0] !== "workflow") throw new Error("publication request workflow record is invalid")
  if (records[2].length !== 3 || records[2][0] !== "run") throw new Error("publication request run record is invalid")
  if (records[3].length !== 4 || records[3][0] !== "release") throw new Error("publication request release record is invalid")
  if (records[4].length !== 4 || records[4][0] !== "lock") throw new Error("publication request lock record is invalid")
  const parsed = validateReleaseHandoff({
    repository: records[0][1],
    workflow: records[1][1],
    runId: records[2][1],
    runAttempt: records[2][2],
    version: records[3][1],
    tag: records[3][2],
    commit: records[3][3],
    lockFile: records[4][1],
    lockBytes: Number(records[4][2]),
    lockSha256: records[4][3],
  })
  if (serializeReleaseHandoff(parsed) !== text) throw new Error("publication request is not canonical")
  return parsed
}
