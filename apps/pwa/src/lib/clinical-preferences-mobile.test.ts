import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CLINICAL_PREFERENCES } from "@lospor/core/clinical-preferences"

const secureStore = vi.hoisted(() => {
  const values = new Map<string, string>()
  return {
    values,
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      values.delete(key)
    }),
  }
})

const api = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiJson: vi.fn(),
}))

vi.mock("expo-secure-store", () => secureStore)
vi.mock("@/lib/api", () => api)

describe("mobile clinical preference synchronization", () => {
  beforeEach(() => {
    secureStore.values.clear()
    vi.clearAllMocks()
    api.apiFetch.mockResolvedValue({ ok: true })
    api.apiJson.mockResolvedValue({ preferences: {} })
  })

  it("imports existing device-only settings", async () => {
    secureStore.values.set("lospor_height_unit", "in")
    secureStore.values.set("intraop_autofill_vitals", "on")
    secureStore.values.set("intraop_autofill_bp", "on")

    const { readMobileClinicalPreferences } = await import(
      "./clinical-preferences-mobile"
    )
    const preferences = await readMobileClinicalPreferences()

    expect(preferences.units.height).toBe("in")
    expect(preferences.autoFillVitals).toMatchObject({
      enabled: true,
      includeBloodPressure: true,
    })
  })

  it("keeps an offline edit and retries it at the next sync", async () => {
    api.apiFetch.mockRejectedValueOnce(new Error("offline"))
    const {
      patchMobileClinicalPreferences,
      syncMobileClinicalPreferences,
    } = await import("./clinical-preferences-mobile")

    const local = await patchMobileClinicalPreferences(
      DEFAULT_CLINICAL_PREFERENCES,
      { units: { height: "in" } },
    )
    expect(local.units.height).toBe("in")
    expect(secureStore.values.get("lospor_clinical_preferences_dirty_v1"))
      .toContain('"height":"in"')

    api.apiJson.mockResolvedValue({
      preferences: { units: { height: "cm", weight: "lb" } },
    })
    api.apiFetch.mockResolvedValue({ ok: true })
    const synced = await syncMobileClinicalPreferences()

    expect(synced.units).toMatchObject({ height: "in", weight: "lb" })
    expect(secureStore.values.has("lospor_clinical_preferences_dirty_v1"))
      .toBe(false)
    expect(api.apiFetch).toHaveBeenLastCalledWith(
      "/api/user",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"height":"in"'),
      }),
    )
  })

  it("uses account settings when the local snapshot is clean", async () => {
    secureStore.values.set(
      "lospor_clinical_preferences_v1",
      JSON.stringify({
        ...DEFAULT_CLINICAL_PREFERENCES,
        units: { ...DEFAULT_CLINICAL_PREFERENCES.units, height: "in" },
      }),
    )
    api.apiJson.mockResolvedValue({
      preferences: { units: { height: "cm" } },
    })

    const { syncMobileClinicalPreferences } = await import(
      "./clinical-preferences-mobile"
    )
    expect((await syncMobileClinicalPreferences()).units.height).toBe("cm")
  })
})
