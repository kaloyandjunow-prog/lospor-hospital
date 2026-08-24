import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ACCOUNT_LOCALE_COOKIE,
  DEVICE_LOCALE_COOKIE,
  LOGIN_LOCALE_CHOICE_COOKIE,
  SESSION_COOKIE,
} from "@/i18n/locales"

const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => state.values.has(name) ? { name, value: state.values.get(name) } : undefined,
    has: (name: string) => state.values.has(name),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.values.set(name, value)
      state.options.set(name, options)
    },
    delete: (name: string) => state.values.delete(name),
  })),
}))

import {
  completeLoginLocale,
  finishLogoutLocale,
  selectDeviceLocale,
} from "./locale"

describe("locale cookie actions", () => {
  beforeEach(() => {
    state.values.clear()
    state.options.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("stores a pre-auth device locale in a hardened long-lived cookie", async () => {
    await selectDeviceLocale("bg")
    expect(state.values.get(DEVICE_LOCALE_COOKIE)).toBe("bg")
    expect(state.options.get(DEVICE_LOCALE_COOKIE)).toEqual(expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 31_536_000,
    }))
  })

  it("marks an explicit login choice and returns it for account persistence", async () => {
    await selectDeviceLocale("bg", "login")
    const completed = await completeLoginLocale("en")
    expect(completed).toEqual({ locale: "bg", persistExplicitChoice: true })
    expect(state.values.get(ACCOUNT_LOCALE_COOKIE)).toBe("bg")
    expect(state.values.has(LOGIN_LOCALE_CHOICE_COOKIE)).toBe(false)
  })

  it("uses the canonical account preference when login had no explicit choice", async () => {
    state.values.set(DEVICE_LOCALE_COOKIE, "bg")
    await expect(completeLoginLocale("en")).resolves.toEqual({
      locale: "en",
      persistExplicitChoice: false,
    })
  })

  it("uses the validated installer default only when login has no other source", async () => {
    vi.stubEnv("LOSPOR_DEFAULT_LOCALE", "en")
    await expect(completeLoginLocale(undefined)).resolves.toEqual({
      locale: "en",
      persistExplicitChoice: false,
    })

    state.values.clear()
    vi.stubEnv("LOSPOR_DEFAULT_LOCALE", "unsupported")
    await expect(completeLoginLocale(undefined)).resolves.toEqual({
      locale: "bg",
      persistExplicitChoice: false,
    })
  })

  it("lets a signed-in user select the exact language of a legal surface", async () => {
    state.values.set(SESSION_COOKIE, "session")
    await selectDeviceLocale("en", "public")
    expect(state.values.get(ACCOUNT_LOCALE_COOKIE)).toBe("en")
  })

  it("removes account locale state on logout while retaining the device choice", async () => {
    state.values.set(DEVICE_LOCALE_COOKIE, "bg")
    state.values.set(ACCOUNT_LOCALE_COOKIE, "en")
    await finishLogoutLocale()
    expect(state.values.get(DEVICE_LOCALE_COOKIE)).toBe("bg")
    expect(state.values.has(ACCOUNT_LOCALE_COOKIE)).toBe(false)
  })
})
