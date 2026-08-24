import * as SecureStore from "expo-secure-store"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadAuthenticatedLocale, saveAuthenticatedLocale } from "./account-locale"
import * as api from "./api"

vi.mock("./api", async importOriginal => {
  const original = await importOriginal<typeof import("./api")>()
  return {
    ...original,
    apiFetch: vi.fn(),
    apiJson: vi.fn(),
    getToken: vi.fn(),
  }
})

function token(payload: Record<string, unknown>): string {
  return `x.${btoa(JSON.stringify(payload))}.y`
}

describe("account locale synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getToken).mockResolvedValue(token({ sub: "account-1" }))
  })

  it("uses the server account preference when available", async () => {
    vi.mocked(api.apiJson).mockResolvedValue({ preferences: { ui: { locale: "en" } } })
    await expect(loadAuthenticatedLocale()).resolves.toEqual({ locale: "en", source: "server" })
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("lospor_account_locale_v1.account-1", "en")
  })

  it("falls back to Bulgarian when an older API omits the preference", async () => {
    vi.mocked(api.apiJson).mockResolvedValue({ preferences: {} })
    await expect(loadAuthenticatedLocale()).resolves.toEqual({ locale: "bg", source: "default" })
  })

  it("keeps an explicit selection locally when PATCH is unavailable", async () => {
    vi.mocked(api.apiFetch).mockResolvedValue({ ok: false } as Response)
    await expect(saveAuthenticatedLocale("en")).resolves.toBe("deferred")
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("lospor_account_locale_v1.account-1", "en")
    expect(api.apiFetch).toHaveBeenCalledWith("/api/user", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ preferences: { ui: { locale: "en" } } }),
    }))
  })
})
