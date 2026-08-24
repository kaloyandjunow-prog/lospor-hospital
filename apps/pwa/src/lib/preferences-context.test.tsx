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
