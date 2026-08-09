import { beforeEach, describe, expect, it, vi } from "vitest"
import { createCaseOutbox } from "@lospor/core/sync"

/**
 * A budget, not a benchmark.
 *
 * Every queued save crosses the JS/native boundary several times, and on
 * Android a SecureStore call is an encrypted Keystore round trip — far more
 * expensive than a file read. This adapter used to consult SecureStore on every
 * cache miss and delete a SecureStore key on every write, long after the
 * one-time migration had drained it, which cost 25 native calls (12 of them
 * Keystore) on the first tap of a case.
 *
 * These ceilings exist so that regressing back into per-operation Keystore
 * traffic fails a test instead of being discovered on a phone at 2am.
 */
const calls = vi.hoisted(() => ({
  file: 0,
  secure: 0,
  reset() { this.file = 0; this.secure = 0 },
}))

const fs = vi.hoisted(() => ({ files: new Map<string, string>() }))

vi.mock("react-native", () => ({ Platform: { OS: "android" } }))

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/doc/",
  getInfoAsync: vi.fn(async (path: string) => {
    calls.file += 1
    return { exists: fs.files.has(path) }
  }),
  readAsStringAsync: vi.fn(async (path: string) => {
    calls.file += 1
    return fs.files.get(path) ?? ""
  }),
  writeAsStringAsync: vi.fn(async (path: string, value: string) => {
    calls.file += 1
    fs.files.set(path, value)
  }),
  deleteAsync: vi.fn(async (path: string) => {
    calls.file += 1
    fs.files.delete(path)
  }),
  makeDirectoryAsync: vi.fn(async () => { calls.file += 1 }),
  readDirectoryAsync: vi.fn(async () => {
    calls.file += 1
    return [...fs.files.keys()].map(p => p.replace("/doc/clinical-sync/", ""))
  }),
}))

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => { calls.secure += 1; return null }),
  setItemAsync: vi.fn(async () => { calls.secure += 1 }),
  deleteItemAsync: vi.fn(async () => { calls.secure += 1 }),
}))

async function freshOutbox() {
  vi.resetModules()
  fs.files.clear()
  const { clinicalSyncKv } = await import("./clinical-sync-kv")
  return createCaseOutbox({
    kv: clinicalSyncKv,
    sendPatch: async () => ({}),
    classifyError: () => ({ kind: "network" as const }),
  })
}

describe("clinical sync storage budget", () => {
  beforeEach(() => { calls.reset() })

  it("touches SecureStore only during the one-time migration", async () => {
    const outbox = await freshOutbox()

    await outbox.queue("case-1", "intraop", { positions: ["supine"] })
    const firstTapSecure = calls.secure

    calls.reset()
    await outbox.queue("case-1", "intraop", { positions: ["supine", "lateral"] })

    // The steady-state save is the one that repeats all day.
    expect(calls.secure).toBe(0)
    expect(calls.file).toBeLessThanOrEqual(6)

    // The migration itself is allowed to use SecureStore — that is its job.
    expect(firstTapSecure).toBeGreaterThan(0)
  })

  it("keeps repeated saves flat rather than growing per tap", async () => {
    const outbox = await freshOutbox()
    await outbox.queue("case-2", "intraop", { hr: 60 }) // absorb migration

    calls.reset()
    for (let i = 0; i < 10; i++) {
      await outbox.queue("case-2", "intraop", { hr: 61 + i })
    }

    expect(calls.secure).toBe(0)
    expect(calls.file).toBeLessThanOrEqual(60)
  })

  it("stops consulting SecureStore on reads once migration has succeeded", async () => {
    vi.resetModules()
    fs.files.clear()
    const { clinicalSyncKv } = await import("./clinical-sync-kv")

    await clinicalSyncKv.get("lospor_patchq_case-3_intraop") // absorbs migration
    calls.reset()
    await clinicalSyncKv.get("lospor_patchq_case-3_intraop") // a miss

    // A miss after migration cannot find anything in SecureStore, so it must
    // not pay a Keystore round trip to discover that.
    expect(calls.secure).toBe(0)
  })

  it("retains the SecureStore fallback while migration keeps failing", async () => {
    vi.resetModules()
    fs.files.clear()

    const secure = await import("expo-secure-store")
    const legacy = await import("expo-file-system/legacy")

    // Legacy queued work still in SecureStore, so migration has something to
    // move — and the write it must perform fails. That is the one uncaught
    // path in migrateLegacyClinicalData; everything else is already .catch-ed,
    // which is why a failed migration is rare rather than impossible.
    vi.mocked(secure.getItemAsync).mockImplementation(async (key: string) => {
      calls.secure += 1
      return key === "lospor_pending_case_patches"
        ? JSON.stringify([{ caseId: "case-4", section: "intraop" }])
        : null
    })
    vi.mocked(legacy.writeAsStringAsync).mockRejectedValue(new Error("disk full"))

    const { clinicalSyncKv } = await import("./clinical-sync-kv")
    await clinicalSyncKv.get("lospor_patchq_case-4_intraop")
    calls.reset()
    await clinicalSyncKv.get("lospor_patchq_case-4_intraop")

    // Contrast with the test above: unmigrated, the second read must STILL try
    // the fallback rather than treat the file store as authoritative. Dropping
    // it here would silently discard a clinician's queued offline edits.
    expect(calls.secure).toBeGreaterThan(0)
  })
})
