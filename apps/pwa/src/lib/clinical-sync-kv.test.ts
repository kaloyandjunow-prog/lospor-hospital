import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  OUTBOX_INDEX_KEY,
  outboxPatchKey,
} from "@lospor/core/sync"

describe("clinical sync file storage", () => {
  const secureValues = new Map<string, string>()

  beforeEach(() => {
    Platform.OS = "ios"
    secureValues.clear()
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => secureValues.get(key) ?? null)
    vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      secureValues.set(key, value)
    })
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
      secureValues.delete(key)
    })
    vi.resetModules()
  })

  it("uses browser storage for the PWA", async () => {
    const values = new Map<string, string>()
    const storage = {
      get length() { return values.size },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })
    Platform.OS = "web"
    const { clinicalSyncKv } = await import("./clinical-sync-kv")
    const { setClinicalSyncOwner } = await import("./clinical-sync-kv")
    setClinicalSyncOwner("test-user")

    await clinicalSyncKv.set("pwa-patch", JSON.stringify({ positions: ["SUPINE"] }))

    expect(await clinicalSyncKv.get("pwa-patch")).toContain("SUPINE")
    expect(await clinicalSyncKv.keys?.("pwa-")).toEqual(["pwa-patch"])
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it("stores clinical payloads larger than SecureStore's practical limit", async () => {
    const { clinicalSyncKv } = await import("./clinical-sync-kv")
    const { setClinicalSyncOwner } = await import("./clinical-sync-kv")
    setClinicalSyncOwner("test-user")
    const value = JSON.stringify({ report: "x".repeat(10_000) })

    await clinicalSyncKv.set("large-clinical-patch", value)

    expect(await clinicalSyncKv.get("large-clinical-patch")).toBe(value)
    expect(secureValues.has("large-clinical-patch")).toBe(false)
  })

  it("hands data queued before account scoping to the first account that signs in, and only to it", async () => {
    const key = outboxPatchKey("case-legacy", "intraop")
    const stored = JSON.stringify({ payload: { positions: ["SUPINE"] }, baseUpdatedAt: 1 })
    secureValues.set(OUTBOX_INDEX_KEY, JSON.stringify([{ caseId: "case-legacy", section: "intraop" }]))
    secureValues.set(key, stored)

    const { clinicalSyncKv, setClinicalSyncOwner } = await import("./clinical-sync-kv")
    setClinicalSyncOwner("first-user")
    expect(await clinicalSyncKv.get(key)).toBe(stored)
    expect(await clinicalSyncKv.get(OUTBOX_INDEX_KEY)).toContain("case-legacy")
    expect(await clinicalSyncKv.keys?.("lospor_patchq_")).toContain(key)

    setClinicalSyncOwner("second-user")
    expect(await clinicalSyncKv.get(key)).toBeNull()
  })

  it("drains legacy SecureStore data out of the secret store while handing it over", async () => {
    const key = outboxPatchKey("case-legacy-2", "intraop")
    secureValues.set(OUTBOX_INDEX_KEY, JSON.stringify([{ caseId: "case-legacy-2", section: "intraop" }]))
    secureValues.set(key, JSON.stringify({ payload: { positions: ["PRONE"] }, baseUpdatedAt: 1 }))

    const { clinicalSyncKv, setClinicalSyncOwner } = await import("./clinical-sync-kv")
    setClinicalSyncOwner("test-user")
    expect(await clinicalSyncKv.get(key)).toContain("PRONE")
    expect(secureValues.has(key)).toBe(false)
    expect(secureValues.has(OUTBOX_INDEX_KEY)).toBe(false)
  })
})
