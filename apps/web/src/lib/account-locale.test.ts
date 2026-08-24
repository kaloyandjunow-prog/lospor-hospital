import { afterEach, describe, expect, it, vi } from "vitest"
import {
  accountLocaleFromPayload,
  loadAccountLocale,
  persistAccountLocale,
} from "./account-locale"

describe("account locale", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reads the canonical nested preference before the convenience field", () => {
    expect(accountLocaleFromPayload({
      user: {
        preferredLocale: "en",
        preferences: { ui: { locale: "bg" } },
      },
    })).toBe("bg")
  })

  it("loads the profile when the login response has no preference", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ preferences: { ui: { locale: "en" } } }), { status: 200 }),
    )
    await expect(loadAccountLocale({ ok: true })).resolves.toBe("en")
    expect(request).toHaveBeenCalledWith("/api/user", expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
    }))
  })

  it("persists only User.preferences.ui.locale", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))
    await expect(persistAccountLocale("bg")).resolves.toBe(true)
    const init = request.mock.calls[0][1]
    expect(JSON.parse(String(init?.body))).toEqual({ preferences: { ui: { locale: "bg" } } })
    expect(init).toEqual(expect.objectContaining({ method: "PATCH", credentials: "same-origin" }))
  })
})

