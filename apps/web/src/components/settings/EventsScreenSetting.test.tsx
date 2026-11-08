// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
const mocks = vi.hoisted(() => ({ patch: (() => Promise.resolve({})) as (...args: unknown[]) => Promise<unknown> }))
const patchWebClinicalPreferences = vi.fn(async () => ({}))
mocks.patch = patchWebClinicalPreferences
vi.mock("@/lib/clinical-preferences-web", () => ({
  readWebClinicalPreferences: () => ({ eventsScreen: "smart" }),
  syncWebClinicalPreferences: async () => ({ eventsScreen: "smart" }),
  patchWebClinicalPreferences: (...args: unknown[]) => mocks.patch(...args),
}))

import { EventsScreenSetting } from "./EventsScreenSetting"

describe("the event selector setting on the web", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    render(<EventsScreenSetting />)
    expect(screen.getByTestId("events-screen-smart").getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByTestId("events-screen-legacy"))
    expect(patchWebClinicalPreferences).toHaveBeenCalledWith({ eventsScreen: "legacy" })
  })
})
