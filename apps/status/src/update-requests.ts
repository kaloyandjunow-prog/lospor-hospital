import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { access, link, mkdir, open, unlink } from "node:fs/promises"
import { join } from "node:path"

// Asking the host agent to apply a release.
//
// Status cannot apply anything: it runs unprivileged, has no docker socket, and
// mounts the agent's state read-only. What it can do is leave a request in a
// directory the agent watches. Everything here is about making that request
// impossible to replay, impossible to forge from a stale page, and impossible
// to issue twice at once.
//
// Be honest about the bound this does not cross. Status *is* the authorised
// writer, so a remote-code-execution bug in this app is a forged request, and
// no shared secret fixes that -- any secret Status can read to sign a request,
// the intruder reads too. What contains it is the agent's own content check:
// the request can name only a semantic version, while the root agent derives
// and authenticates every release identity itself. Apply additionally requires
// the one exact root-owned prepared descriptor. A forged request can therefore
// consume bandwidth or ask for a genuine maintainer-signed newer release at an
// inconvenient moment, but cannot select a URL, path, digest, image or command.

export const REQUEST_FILE = "apply.request.v2.tsv"
export const PREPARE_REQUEST_FILE = "prepare.request.v2.tsv"
export const CHECK_REQUEST_FILE = "check.request"
export const TERMINOLOGY_REQUEST_FILE = "terminology.request.v1.tsv"

/** Five minutes: long enough to read the confirmation, short enough to matter. */
const CONFIRMATION_TTL_MS = 5 * 60_000

export type ApplyRequest = {
  requestId: string
  targetVersion: string
  window: "scheduled" | "override"
}

export type TerminologyRequest = {
  requestId: string
  action: "import" | "resume" | "rollback" | "finalize"
  /**
   * One direct child of reference-data, never a path supplied to a command.
   * Rollback and finalization carry "-" because they select only host state.
   */
  packageDirectory: string | null
  /** Pseudonymous Status-operator provenance, derived by Status itself. */
  operatorRef: string
}

/**
 * A token binding one confirmation to one session and one release.
 *
 * HMAC over the session's own hash, the release digest and the minute it was
 * minted, using the rate-limit key that is already loaded and already used this
 * way. No new table, no cleanup job, and it survives a restart -- and because
 * the session hash is in it, a token minted for one operator is useless to
 * another.
 */
export function mintConfirmation(
  key: Buffer,
  sessionHash: string,
  targetLockSha256: string,
  now: number,
): string {
  const minute = Math.floor(now / 60_000)
  return createHmac("sha256", key)
    .update(`${sessionHash}\0${targetLockSha256}\0${minute}`)
    .digest("hex")
}

/**
 * True when `token` was minted for this session and release within the window.
 *
 * Compared in constant time, and against every minute in the window rather than
 * a stored expiry, so there is nothing to clean up and nothing to leak.
 */
export function verifyConfirmation(
  key: Buffer,
  sessionHash: string,
  targetLockSha256: string,
  token: string,
  now: number,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(token)) return false
  const supplied = Buffer.from(token, "hex")
  const minutes = Math.ceil(CONFIRMATION_TTL_MS / 60_000)
  let matched = false
  for (let back = 0; back <= minutes; back += 1) {
    const candidate = Buffer.from(
      mintConfirmation(key, sessionHash, targetLockSha256, now - back * 60_000), "hex",
    )
    // No early return: every candidate is compared so the time taken says
    // nothing about which minute matched.
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) matched = true
  }
  return matched
}

export function newRequestId(): string {
  return randomBytes(16).toString("hex")
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r")
  try {
    await directory.sync()
  } catch (error) {
    // Windows does not expose directory fsync. Status production is Linux,
    // where a successful directory sync is part of the durable request
    // contract; keep local Windows unit tests portable without weakening it.
    if (process.platform !== "win32") throw error
  } finally {
    await directory.close()
  }
}

async function publishRequest(
  requestsDir: string,
  targetName: string,
  temporaryName: string,
  body: string,
): Promise<"submitted" | "already-pending"> {
  await mkdir(requestsDir, { recursive: true })
  const target = join(requestsDir, targetName)
  const temporary = join(requestsDir, temporaryName)
  const handle = await open(temporary, "wx", 0o644)
  try {
    await handle.writeFile(`${body}\n`, "utf8")
    await handle.sync()
  } finally {
    await handle.close()
  }
  let outcome: "submitted" | "already-pending" = "submitted"
  try {
    await link(temporary, target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") outcome = "already-pending"
    else throw error
  } finally {
    // A surviving alias leaves nlink=2 and the root agent correctly refuses
    // it. Surface that publication failure instead of telling the operator a
    // request was submitted when it cannot be consumed.
    await unlink(temporary)
  }
  await syncDirectory(requestsDir)
  return outcome
}

/**
 * Writes the request, or reports that one is already waiting.
 *
 * Written to a temporary name and then `link()`ed into place. link() fails with
 * EEXIST if the target exists, which gives at-most-one-pending atomically, with
 * no lock file to leak and a clean answer the page can render. A plain write
 * would silently replace a request the agent had not yet read.
 */
export async function submitRequest(
  requestsDir: string,
  request: ApplyRequest,
  now: number,
): Promise<"submitted" | "already-pending"> {
  const createdEpoch = Math.floor(now / 1000)
  const body = [
    "LOSPOR-HOSPITAL-UPDATE-REQUEST-V2",
    "apply",
    request.requestId,
    request.targetVersion,
    String(createdEpoch),
    request.window,
  ].join("\t")
  return publishRequest(requestsDir, REQUEST_FILE, `.${request.requestId}.tmp`, body)
}

/**
 * Asks the agent to prepare one named release.
 *
 * Downloading changes nothing that is running, so this needs no confirmation
 * and no token -- the worst it can do is use bandwidth. It exists so a site
 * with the slow clock turned down still has a route to both steps without
 * anyone opening an SSH session.
 *
 * The host derives the repository, tag, release ID, lock/signature identities,
 * asset paths and commands independently. Status contributes only durable
 * intent: an opaque ID, the semantic version, and its creation instant.
 */
export async function requestFetch(
  requestsDir: string,
  targetVersion: string,
  now: number,
): Promise<"submitted" | "already-pending"> {
  const requestId = newRequestId()
  const body = [
    "LOSPOR-HOSPITAL-UPDATE-REQUEST-V2",
    "prepare",
    requestId,
    targetVersion,
    String(Math.floor(now / 1000)),
    "none",
  ].join("\t")
  return publishRequest(requestsDir, PREPARE_REQUEST_FILE, `.${requestId}.tmp`, body)
}

/**
 * Leaves bounded terminology intent for the root host agent.
 *
 * Status cannot provide a command, absolute/relative path, manifest identity,
 * database name, or confirmation flag. The root agent maps the fixed action to
 * one packaged wrapper and resolves an import only as
 * `reference-data/<single-safe-directory>`. The wrapper then performs the
 * existing exact-manifest verification and atomic generation workflow.
 */
export async function submitTerminologyRequest(
  requestsDir: string,
  request: TerminologyRequest,
  now: number,
): Promise<"submitted" | "already-pending"> {
  if (!/^[a-f0-9]{32}$/.test(request.requestId)
    || !/^(?:import|resume|rollback|finalize)$/.test(request.action)
    || !/^status-operator-[a-f0-9]{16}$/.test(request.operatorRef)) {
    throw new Error("Invalid terminology request")
  }
  const needsPackage = request.action === "import" || request.action === "resume"
  if (needsPackage !== (request.packageDirectory !== null)
    || (request.packageDirectory !== null
      && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(request.packageDirectory))) {
    throw new Error("Invalid terminology package directory")
  }
  const body = [
    "LOSPOR-HOSPITAL-TERMINOLOGY-REQUEST-V1",
    request.action,
    request.requestId,
    request.packageDirectory ?? "-",
    String(Math.floor(now / 1000)),
    request.operatorRef,
  ].join("\t")
  return publishRequest(
    requestsDir,
    TERMINOLOGY_REQUEST_FILE,
    `.terminology-${request.requestId}.tmp`,
    body,
  )
}

export const MAINTENANCE_REQUEST_FILE = "maintenance.request.v1.tsv"
export const SITE_CONFIG_PROPOSAL_FILE = "site-config.proposal.v1.env"
export const OFFHOST_PROPOSAL_FILE = "offhost.proposal.v1.conf"

export type MaintenanceRequest = {
  requestId: string
  action: "backup" | "drill" | "config" | "offhost-config" | "offhost-test" | "offhost-drill" | "offhost-disable"
  /** Pseudonymous Status-operator provenance, derived by Status itself. */
  operatorRef: string
  /** The complete proposed site.env or off-host destination, for those two changes only. */
  proposal?: { content: string; sha256: string }
}

/**
 * Leaves maintenance intent for the root host agent.
 *
 * A backup or a drill names nothing but itself. A settings change names the
 * SHA-256 of the one proposal file written beside it; the agent copies that
 * file, checks the digest, the site-settings contract and the keys Status may
 * change, and only then applies it. At most one maintenance request waits.
 */
export async function submitMaintenanceRequest(
  requestsDir: string,
  request: MaintenanceRequest,
  now: number,
): Promise<"submitted" | "already-pending"> {
  if (!/^[a-f0-9]{32}$/.test(request.requestId)
    || !/^(?:backup|drill|config|offhost-config|offhost-test|offhost-drill|offhost-disable)$/.test(request.action)
    || !/^status-operator-[a-f0-9]{16}$/.test(request.operatorRef)
    || (request.action === "config" || request.action === "offhost-config") !== (request.proposal !== undefined)
    || (request.proposal !== undefined && (
      Buffer.byteLength(request.proposal.content) > 8192
      || createHash("sha256").update(request.proposal.content).digest("hex") !== request.proposal.sha256))) {
    throw new Error("Invalid maintenance request")
  }
  await mkdir(requestsDir, { recursive: true })
  try {
    await access(join(requestsDir, MAINTENANCE_REQUEST_FILE))
    return "already-pending"
  } catch {
    // Nothing is waiting.
  }
  if (request.proposal) {
    // A proposal with no request is left over from a publication that failed
    // after writing it. Nothing will ever read it, so it is replaced.
    const proposalFile = request.action === "config" ? SITE_CONFIG_PROPOSAL_FILE : OFFHOST_PROPOSAL_FILE
    await unlink(join(requestsDir, proposalFile)).catch(() => undefined)
    const written = await publishRequest(
      requestsDir,
      proposalFile,
      `.proposal-${request.requestId}.tmp`,
      request.proposal.content.replace(/\n$/, ""),
    )
    if (written === "already-pending") return "already-pending"
  }
  const body = [
    "LOSPOR-HOSPITAL-MAINTENANCE-REQUEST-V1",
    request.action,
    request.requestId,
    request.proposal?.sha256 ?? "-",
    String(Math.floor(now / 1000)),
    request.operatorRef,
  ].join("\t")
  return publishRequest(requestsDir, MAINTENANCE_REQUEST_FILE, `.maintenance-${request.requestId}.tmp`, body)
}
