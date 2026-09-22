import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  REQUEST_FILE,
  PREPARE_REQUEST_FILE,
  TERMINOLOGY_REQUEST_FILE,
  mintConfirmation,
  newRequestId,
  requestCheck,
  requestFetch,
  submitRequest,
  submitTerminologyRequest,
  verifyConfirmation,
} from "./update-requests.js"

const KEY = Buffer.alloc(32, 7)
const OTHER_KEY = Buffer.alloc(32, 9)
const NOW = Date.parse("2026-08-20T12:00:00Z")
const SESSION = "a".repeat(64)
const LOCK = "b".repeat(64)

const dirs: string[] = []
const workspace = () => {
  const dir = mkdtempSync(join(tmpdir(), "lospor-update-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const request = (over: Record<string, unknown> = {}) => ({
  requestId: newRequestId(),
  targetVersion: "1.3.0",
  window: "scheduled" as const,
  ...over,
})

describe("confirming an update", () => {
  it("accepts the token it just minted", () => {
    const token = mintConfirmation(KEY, SESSION, LOCK, NOW)
    expect(verifyConfirmation(KEY, SESSION, LOCK, token, NOW)).toBe(true)
  })

  // Bound to the session, so a confirmation cannot be handed to anyone else --
  // including an attacker who has the page but not the cookie.
  it("refuses a token minted for another session", () => {
    const token = mintConfirmation(KEY, "c".repeat(64), LOCK, NOW)
    expect(verifyConfirmation(KEY, SESSION, LOCK, token, NOW)).toBe(false)
  })

  // The whole point of carrying the digest: the operator approves the release
  // the page showed them, not whatever landed while they were reading.
  it("refuses a token minted for a different release", () => {
    const token = mintConfirmation(KEY, SESSION, "d".repeat(64), NOW)
    expect(verifyConfirmation(KEY, SESSION, LOCK, token, NOW)).toBe(false)
  })

  it("refuses a token from a different key", () => {
    const token = mintConfirmation(OTHER_KEY, SESSION, LOCK, NOW)
    expect(verifyConfirmation(KEY, SESSION, LOCK, token, NOW)).toBe(false)
  })

  it("stays valid for a few minutes and then stops", () => {
    const token = mintConfirmation(KEY, SESSION, LOCK, NOW)
    expect(verifyConfirmation(KEY, SESSION, LOCK, token, NOW + 4 * 60_000)).toBe(true)
    expect(verifyConfirmation(KEY, SESSION, LOCK, token, NOW + 20 * 60_000)).toBe(false)
  })

  it("refuses anything that is not a token", () => {
    for (const junk of ["", "not-hex", "a".repeat(63), "z".repeat(64)]) {
      expect(verifyConfirmation(KEY, SESSION, LOCK, junk, NOW)).toBe(false)
    }
  })
})

describe("leaving a request for the agent", () => {
  it("writes one the agent can read", async () => {
    const dir = workspace()
    expect(await submitRequest(dir, request(), NOW)).toBe("submitted")

    const written = readFileSync(join(dir, REQUEST_FILE), "utf8").trim().split("\t")
    expect(written).toEqual([
      "LOSPOR-HOSPITAL-UPDATE-REQUEST-V2",
      "apply",
      expect.stringMatching(/^[a-f0-9]{32}$/),
      "1.3.0",
      String(Math.floor(NOW / 1000)),
      "scheduled",
    ])
  })

  // At-most-one-pending, atomically. Without it a second click would silently
  // replace a request the agent had not yet read -- and the operator would have
  // approved one release while a different one was applied.
  it("refuses a second request while one is waiting", async () => {
    const dir = workspace()
    expect(await submitRequest(dir, request(), NOW)).toBe("submitted")
    expect(await submitRequest(dir, request(), NOW)).toBe("already-pending")
  })

  it("leaves nothing behind when it refuses", async () => {
    const dir = workspace()
    await submitRequest(dir, request(), NOW)
    await submitRequest(dir, request(), NOW)
    const { readdirSync } = await import("node:fs")
    // Only the request itself: a failed link must not leak its temporary file.
    expect(readdirSync(dir)).toEqual([REQUEST_FILE])
  })
  it("records durable preparation intent without a trusted path or digest", async () => {
    const dir = workspace()
    expect(await requestFetch(dir, "1.3.0", NOW)).toBe("submitted")
    expect(await requestFetch(dir, "1.3.0", NOW)).toBe("already-pending")
    const written = readFileSync(join(dir, PREPARE_REQUEST_FILE), "utf8").trim().split("\t")
    expect(written).toEqual([
      "LOSPOR-HOSPITAL-UPDATE-REQUEST-V2",
      "prepare",
      expect.stringMatching(/^[a-f0-9]{32}$/),
      "1.3.0",
      String(Math.floor(NOW / 1000)),
      "none",
    ])
  })

  it("leaves one fixed manual-check request and refuses a duplicate", async () => {
    const dir = workspace()
    expect(await requestCheck(dir, NOW)).toBe("submitted")
    expect(await requestCheck(dir, NOW)).toBe("already-pending")
    expect(readFileSync(join(dir, "check.request"), "utf8").trim().split("\t")).toEqual([
      "LOSPOR-HOSPITAL-UPDATE-CHECK-V1",
      String(Math.floor(NOW / 1000)),
    ])
  })
})

describe("leaving bounded terminology intent", () => {
  it("records only a fixed action and one direct package-directory label", async () => {
    const dir = workspace()
    const requestId = "e".repeat(32)
    expect(await submitTerminologyRequest(dir, {
      requestId,
      action: "import",
      packageDirectory: "approved-omop-2026.08",
      operatorRef: "status-operator-0123456789abcdef",
    }, NOW)).toBe("submitted")
    expect(readFileSync(join(dir, TERMINOLOGY_REQUEST_FILE), "utf8").trim().split("\t")).toEqual([
      "LOSPOR-HOSPITAL-TERMINOLOGY-REQUEST-V1",
      "import",
      requestId,
      "approved-omop-2026.08",
      String(Math.floor(NOW / 1000)),
      "status-operator-0123456789abcdef",
    ])
  })

  it("uses host state rather than a browser-supplied target for rollback", async () => {
    const dir = workspace()
    await submitTerminologyRequest(dir, {
      requestId: "f".repeat(32),
      action: "rollback",
      packageDirectory: null,
      operatorRef: "status-operator-fedcba9876543210",
    }, NOW)
    expect(readFileSync(join(dir, TERMINOLOGY_REQUEST_FILE), "utf8")).toContain("\trollback\t")
    expect(readFileSync(join(dir, TERMINOLOGY_REQUEST_FILE), "utf8")).toContain("\t-\t")
  })

  it.each([
    "../licensed",
    "nested/package",
    ".hidden",
    "C:\\licensed",
    "package name",
  ])("refuses an unsafe or non-direct package label: %s", async packageDirectory => {
    const dir = workspace()
    await expect(submitTerminologyRequest(dir, {
      requestId: "1".repeat(32),
      action: "import",
      packageDirectory,
      operatorRef: "status-operator-0123456789abcdef",
    }, NOW)).rejects.toThrow("Invalid terminology package directory")
    expect(readdirSync(dir)).toEqual([])
  })

  it("permits at most one pending terminology operation", async () => {
    const dir = workspace()
    const first = {
      requestId: "2".repeat(32),
      action: "finalize" as const,
      packageDirectory: null,
      operatorRef: "status-operator-0123456789abcdef",
    }
    expect(await submitTerminologyRequest(dir, first, NOW)).toBe("submitted")
    expect(await submitTerminologyRequest(dir, { ...first, requestId: "3".repeat(32) }, NOW))
      .toBe("already-pending")
  })
})
