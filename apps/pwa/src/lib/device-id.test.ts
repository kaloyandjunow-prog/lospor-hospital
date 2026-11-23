import { beforeEach, describe, expect, it, vi } from "vitest"

const store = new Map<string, string>()
const setItemAsync = vi.fn(async (key: string, value: string) => { store.set(key, value) })
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => { await Promise.resolve(); return store.get(key) ?? null }),
  setItemAsync,
}))
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }))

describe("the device id", () => {
  beforeEach(() => { store.clear(); setItemAsync.mockClear(); vi.resetModules() })

  it("is one id even when two callers ask at the first start", async () => {
    const { getDeviceId } = await import("./use-case-lock")
    const [a, b] = await Promise.all([getDeviceId(), getDeviceId()])
    expect(a).toBe(b)
    expect(setItemAsync).toHaveBeenCalledTimes(1)
  })
})
