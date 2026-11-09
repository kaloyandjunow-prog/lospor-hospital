import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"

const applianceLocale = vi.hoisted(() => ({
  load: vi.fn<() => Promise<"bg" | "en">>(),
}))

vi.mock("@/lib/appliance-locale", () => ({
  loadApplianceDefaultLocale: applianceLocale.load,
}))

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ state: "unauthenticated" as const }),
}))

const clinicalSave = vi.hoisted(() => ({ patch: vi.fn(async () => {}) }))
vi.mock("@/lib/clinical-preferences-mobile", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/clinical-preferences-mobile")>(),
  patchMobileClinicalPreferences: clinicalSave.patch,
}))

import { PreferencesProvider, usePreferences } from "./preferences-context"

let current: ReturnType<typeof usePreferences> | undefined

function PreferenceProbe() {
  current = usePreferences()
  return null
}

beforeEach(() => {
  current = undefined
  applianceLocale.load.mockReset()
})

describe("login locale race", () => {
  it("does not overwrite a visible login choice with a late appliance default", async () => {
    let resolveDefault: ((language: "bg" | "en") => void) | undefined
    applianceLocale.load.mockReturnValue(new Promise(resolve => { resolveDefault = resolve }))

    let tree: TestRenderer.ReactTestRenderer | undefined
    await act(async () => {
      tree = TestRenderer.create(
        <PreferencesProvider>
          <PreferenceProbe />
        </PreferencesProvider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(applianceLocale.load).toHaveBeenCalledTimes(1)
    await act(async () => {
      await current?.selectLoginLanguage("en")
    })
    await act(async () => {
      resolveDefault?.("bg")
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(current?.language).toBe("en")
    expect(current?.localeReady).toBe(true)
    act(() => tree?.unmount())
  })
})

describe("keep logging after a yes to a vitals question (10.1.0)", () => {
  it("is on by default, and a switch to off shows at once and is saved to the account", async () => {
    applianceLocale.load.mockResolvedValue("en")
    let tree: TestRenderer.ReactTestRenderer | undefined
    await act(async () => {
      tree = TestRenderer.create(
        <PreferencesProvider>
          <PreferenceProbe />
        </PreferencesProvider>,
      )
      await Promise.resolve()
    })
    expect(current?.vitalEpisodeAutoLog).toBe(true)
    await act(async () => { await current?.setVitalEpisodeAutoLog(false) })
    expect(current?.vitalEpisodeAutoLog).toBe(false)
    expect(clinicalSave.patch).toHaveBeenLastCalledWith(expect.anything(), { vitalEpisodeAutoLog: false })
    act(() => tree?.unmount())
  })
})
