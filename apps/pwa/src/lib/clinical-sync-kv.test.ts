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

    await clinicalSyncKv.set("pwa-patch", JSON.stringify({ positions: ["SUPINE"] }))

    expect(await clinicalSyncKv.get("pwa-patch")).toContain("SUPINE")
    expect(await clinicalSyncKv.keys?.("pwa-")).toEqual(["pwa-patch"])
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it("stores clinical payloads larger than SecureStore's practical limit", async () => {
    const { clinicalSyncKv } = await import("./clinical-sync-kv")
    const value = JSON.stringify({ report: "x".repeat(10_000) })

    await clinicalSyncKv.set("large-clinical-patch", value)

    expect(await clinicalSyncKv.get("large-clinical-patch")).toBe(value)
    expect(secureValues.has("large-clinical-patch")).toBe(false)
  })

  it("migrates an existing SecureStore outbox without dropping its patch", async () => {
    const key = outboxPatchKey("case-legacy", "intraop")
    const stored = JSON.stringify({
      payload: { positions: ["SUPINE"], techniques: ["GENERAL_INHALATIONAL"] },
      baseUpdatedAt: 1,
    })
    secureValues.set(
      OUTBOX_INDEX_KEY,
      JSON.stringify([{ caseId: "case-legacy", section: "intraop" }]),
    )
    secureValues.set(key, stored)

    const { clinicalSyncKv } = await import("./clinical-sync-kv")
    const keys = await clinicalSyncKv.keys?.("lospor_patchq_")

    expect(keys).toContain(key)
    expect(await clinicalSyncKv.get(key)).toBe(stored)
    expect(secureValues.has(key)).toBe(false)
    expect(secureValues.has(OUTBOX_INDEX_KEY)).toBe(false)
  })
})
