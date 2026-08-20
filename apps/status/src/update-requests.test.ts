import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  REQUEST_FILE,
  mintConfirmation,
  newRequestId,
  submitRequest,
  sweepExpired,
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
  targetLockSha256: LOCK,
  expectedInstalledVersion: "1.2.0",
  sessionKind: "password" as const,
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

    const written = JSON.parse(readFileSync(join(dir, REQUEST_FILE), "utf8"))
    expect(written).toMatchObject({
      schemaVersion: 1,
      requestType: "apply-release",
      targetVersion: "1.3.0",
      expectedInstalledVersion: "1.2.0",
      sessionKind: "password",
    })
    // Both times are carried: the agent refuses an expired request, and a
    // request with no expiry could sit through a power cut and apply itself
    // days later.
    expect(Date.parse(written.expiresAt)).toBeGreaterThan(NOW)
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
})

describe("clearing a request nobody answered", () => {
  // A dead agent must not be able to wedge the channel forever.
  it("removes one that has expired", async () => {
    const dir = workspace()
    await submitRequest(dir, request(), NOW)
    expect(await sweepExpired(dir, NOW + 60 * 60_000)).toBe(true)
    expect(await submitRequest(dir, request(), NOW)).toBe("submitted")
  })

  // And Status must not be able to withdraw one the agent is about to act on.
  it("leaves a live one alone", async () => {
    const dir = workspace()
    await submitRequest(dir, request(), NOW)
    expect(await sweepExpired(dir, NOW + 60_000)).toBe(false)
    expect(await submitRequest(dir, request(), NOW)).toBe("already-pending")
  })

  it("ignores a request it cannot read", async () => {
    const dir = workspace()
    writeFileSync(join(dir, REQUEST_FILE), "not json")
    expect(await sweepExpired(dir, NOW)).toBe(false)
  })
})
