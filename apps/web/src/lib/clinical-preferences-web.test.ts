import { beforeEach, describe, expect, it, vi } from "vitest"

class MemoryStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe("web clinical preference synchronization", () => {
  const storage = new MemoryStorage()

  beforeEach(() => {
    storage.clear()
    vi.restoreAllMocks()
    Object.assign(globalThis, {
      localStorage: storage,
      window: { dispatchEvent: vi.fn() },
      StorageEvent: class {
        constructor(
          public type: string,
          public init?: Record<string, unknown>,
        ) {}
      },
      fetch: vi.fn(),
    })
  })

  it("merges only the exact fields changed while offline", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
    const {
      patchWebClinicalPreferences,
      syncWebClinicalPreferences,
    } = await import("./clinical-preferences-web")

    await patchWebClinicalPreferences({ units: { height: "in" } })
    expect(storage.getItem("losporClinicalPreferencesDirtyV1"))
      .toContain('"height":"in"')

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          preferences: { units: { height: "cm", weight: "lb" } },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)

    const synced = await syncWebClinicalPreferences()

    expect(synced.units).toMatchObject({ height: "in", weight: "lb" })
    expect(storage.getItem("losporClinicalPreferencesDirtyV1")).toBeNull()
  })
})
