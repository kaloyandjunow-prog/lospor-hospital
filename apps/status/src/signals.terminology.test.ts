import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  parseTerminologyAgentSignal,
  readTerminologyAgentSignal,
} from "./signals.js"

const NOW = Date.parse("2026-08-23T09:00:00Z")
const valid = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  signalType: "terminology-agent",
  observedAt: "2026-08-23T08:59:30Z",
  phase: "completed",
  resultCode: "TERMINOLOGY_IMPORT_COMPLETED",
  rollbackAvailable: true,
  lastAction: "import",
  packageId: "hospital-omop",
  packageVersion: "2026.08",
  activatedAt: "2026-08-23T08:55:00Z",
  manifestSha256: "a".repeat(64),
  ...extra,
})

describe("the terminology host projection", () => {
  it("accepts only the bounded provenance needed by Status", () => {
    expect(parseTerminologyAgentSignal(valid(), NOW)).toMatchObject({
      phase: "completed",
      packageId: "hospital-omop",
      rollbackAvailable: true,
    })
  })

  it.each([
    { sourcePath: "/licensed/athena" },
    { databaseName: "lospor_previous_secret" },
    { licenceText: "restricted" },
    { log: "raw host output" },
    { credential: "secret" },
  ])("rejects every extra host or licensed-data field: %j", extra => {
    expect(parseTerminologyAgentSignal(valid(extra), NOW)).toBeNull()
  })

  it("rejects partial active-generation provenance", () => {
    const partial = valid()
    delete (partial as Partial<typeof partial>).manifestSha256
    expect(parseTerminologyAgentSignal(partial, NOW)).toBeNull()
  })

  it("rejects even a safe package-directory label because host paths do not cross into Status", () => {
    expect(parseTerminologyAgentSignal(valid({ targetPackage: "approved-2026.08" }), NOW)).toBeNull()
  })

  it("returns unknown for malformed or oversized host state", async () => {
    const root = mkdtempSync(join(tmpdir(), "lospor-term-signal-"))
    directories.push(root)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, "terminology-agent.v1.json"), `${"x".repeat(5000)}\n`)
    expect(await readTerminologyAgentSignal(root, NOW)).toBeNull()
  })
})

const directories: string[] = []
afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})
