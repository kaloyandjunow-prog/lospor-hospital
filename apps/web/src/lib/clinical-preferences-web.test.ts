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
      setWebClinicalPreferencesOwner,
    } = await import("./clinical-preferences-web")

    setWebClinicalPreferencesOwner("user-1")
    await patchWebClinicalPreferences({ units: { height: "in" } })
    expect(storage.getItem("losporClinicalPreferencesDirtyV1"))
      .toContain('"height":"in"')

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "user-1",
          preferences: { units: { height: "cm", weight: "lb" } },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preferencesRevision: 1 }) } as Response)

    const synced = await syncWebClinicalPreferences()

    expect(synced.units).toMatchObject({ height: "in", weight: "lb" })
    expect(storage.getItem("losporClinicalPreferencesDirtyV1")).toBeNull()
  })

  it("does not carry a previous account's local settings into the next account", async () => {
    const preferencesModule = await import("./clinical-preferences-web")
    preferencesModule.setWebClinicalPreferencesOwner("user-a")
    await preferencesModule.patchWebClinicalPreferences({ units: { height: "in" } })

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "user-b", preferences: { units: { height: "cm", weight: "kg" } } }),
    } as Response)
    const synced = await preferencesModule.syncWebClinicalPreferences()

    expect(synced.units).toMatchObject({ height: "cm", weight: "kg" })
    expect(storage.getItem("losporClinicalPreferencesOwnerV1")).toBe("user-b")
  })

  it("ignores a preference response that belongs to the account before a switch", async () => {
    const preferencesModule = await import("./clinical-preferences-web")
    let resolveResponse!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveResponse = resolve }))
    preferencesModule.setWebClinicalPreferencesOwner("user-a")
    const pending = preferencesModule.syncWebClinicalPreferences()

    preferencesModule.setWebClinicalPreferencesOwner("user-b")
    resolveResponse({
      ok: true,
      json: async () => ({ id: "user-a", preferences: { units: { height: "in" } } }),
    } as Response)

    const result = await pending
    expect(storage.getItem("losporClinicalPreferencesOwnerV1")).toBe("user-b")
    expect(result.units.height).toBe("cm")
  })

  it("shares one request between components that ask while it is on its way", async () => {
    const preferencesModule = await import("./clinical-preferences-web")
    let resolveResponse!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveResponse = resolve }))
    preferencesModule.setWebClinicalPreferencesOwner("user-a")
    const first = preferencesModule.syncWebClinicalPreferences()
    const second = preferencesModule.syncWebClinicalPreferences()
    const third = preferencesModule.syncWebClinicalPreferences()
    resolveResponse({ ok: true, json: async () => ({ id: "user-a", preferences: {} }) } as Response)
    await Promise.all([first, second, third])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

    // After it settles, the next caller asks again.
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "user-a", preferences: {} }) } as Response)
    await preferencesModule.syncWebClinicalPreferences()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it("sends a storage event only for a setting that changed", async () => {
    const preferencesModule = await import("./clinical-preferences-web")
    const dispatch = (globalThis as unknown as { window: { dispatchEvent: ReturnType<typeof vi.fn> } }).window.dispatchEvent
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "user-a", preferences: {} }) } as Response)
    preferencesModule.setWebClinicalPreferencesOwner("user-a")
    await preferencesModule.syncWebClinicalPreferences()
    const afterFirst = dispatch.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)

    // The same answer again changes nothing, so nobody is woken.
    await preferencesModule.syncWebClinicalPreferences()
    expect(dispatch.mock.calls.length).toBe(afterFirst)

    // A real change wakes exactly its key.
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "user-a", preferences: { units: { height: "in" } } }) } as Response)
    await preferencesModule.syncWebClinicalPreferences()
    const keys = dispatch.mock.calls.slice(afterFirst).map(call => (call[0] as { init?: { key?: string } }).init?.key)
    expect(keys).toEqual(["heightUnit"])
  })
})
