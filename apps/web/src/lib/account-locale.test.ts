import { afterEach, describe, expect, it, vi } from "vitest"
import { accountLocaleFromPayload, loadAccountLocale, persistAccountLocale } from "./account-locale"
describe("account locale", () => {
  afterEach(() => vi.restoreAllMocks())
  it("reads canonical nested preference first", () => { expect(accountLocaleFromPayload({ user: { preferredLocale: "en", preferences: { ui: { locale: "bg" } } } })).toBe("bg") })
  it("loads profile when login has no preference", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ preferences: { ui: { locale: "en" } } }), { status: 200 }))
    await expect(loadAccountLocale({ ok: true })).resolves.toBe("en")
  })
  it("persists only preferences.ui.locale", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))
    await expect(persistAccountLocale("bg")).resolves.toBe(true)
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ preferences: { ui: { locale: "bg" } } })
  })
})
