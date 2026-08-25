import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  bearerToken,
  configuredAccountControlToken,
  configuredAccountControlTokens,
  configuredStatusToken,
  configuredStatusTokens,
  constantTimeTokenMatch,
  matchingConfiguredToken,
} from "./status-snapshot-auth"

const directories: string[] = []
afterEach(() => {
  delete process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE
  delete process.env.HOSPITAL_STATUS_ACCOUNT_CONTROL_TOKEN_FILE
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

describe("internal appliance status authentication", () => {
  it("extracts only a non-empty Bearer token", () => {
    expect(bearerToken(new Request("http://api/internal", {
      headers: { authorization: "Bearer secret-value" },
    }))).toBe("secret-value")
    expect(bearerToken(new Request("http://api/internal"))).toBeNull()
    expect(bearerToken(new Request("http://api/internal", {
      headers: { authorization: "Basic secret-value" },
    }))).toBeNull()
  })

  it("requires an exact constant-time comparable token", () => {
    expect(constantTimeTokenMatch("secret-value", "secret-value")).toBe(true)
    expect(constantTimeTokenMatch("secret-valuE", "secret-value")).toBe(false)
    expect(constantTimeTokenMatch("short", "secret-value")).toBe(false)
    expect(constantTimeTokenMatch(null, "secret-value")).toBe(false)
  })

  it("keeps snapshot reads and account mutations on separate bearer files", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lospor-status-bearers-"))
    directories.push(directory)
    const snapshotPath = join(directory, "snapshot")
    const accountPath = join(directory, "accounts")
    writeFileSync(snapshotPath, "s".repeat(32))
    writeFileSync(accountPath, "a".repeat(32))
    process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE = snapshotPath
    process.env.HOSPITAL_STATUS_ACCOUNT_CONTROL_TOKEN_FILE = accountPath
    await expect(configuredStatusToken()).resolves.toBe("s".repeat(32))
    await expect(configuredAccountControlToken()).resolves.toBe("a".repeat(32))
  })

  it("accepts current plus a sibling previous token only during a bounded overlap", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lospor-status-bearers-"))
    directories.push(directory)
    const snapshotPath = join(directory, "snapshot")
    const accountPath = join(directory, "accounts")
    writeFileSync(snapshotPath, "s".repeat(32))
    writeFileSync(`${snapshotPath}.previous`, "p".repeat(32))
    writeFileSync(accountPath, "a".repeat(32))
    writeFileSync(`${accountPath}.previous`, "b".repeat(32))
    process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE = snapshotPath
    process.env.HOSPITAL_STATUS_ACCOUNT_CONTROL_TOKEN_FILE = accountPath

    await expect(configuredStatusTokens()).resolves.toEqual(["s".repeat(32), "p".repeat(32)])
    await expect(configuredAccountControlTokens()).resolves.toEqual(["a".repeat(32), "b".repeat(32)])
    expect(matchingConfiguredToken("p".repeat(32), ["s".repeat(32), "p".repeat(32)]))
      .toBe("p".repeat(32))

    rmSync(`${snapshotPath}.previous`)
    await expect(configuredStatusTokens()).resolves.toEqual(["s".repeat(32)])
    expect(matchingConfiguredToken("p".repeat(32), ["s".repeat(32)])).toBeNull()
  })
})
