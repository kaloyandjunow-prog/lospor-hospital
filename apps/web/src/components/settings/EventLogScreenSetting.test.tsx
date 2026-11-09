// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
const mocks = vi.hoisted(() => ({ patch: vi.fn(async () => ({})) }))
vi.mock("@/lib/clinical-preferences-web", () => ({
  readWebClinicalPreferences: () => ({ eventLogScreen: "smart" }),
  syncWebClinicalPreferences: async () => ({ eventLogScreen: "smart" }),
  patchWebClinicalPreferences: mocks.patch,
}))

import { EventLogScreenSetting } from "./EventLogScreenSetting"

describe("the Event log setting on the web", () => {
  it("offers Timeline stream and Legacy and saves the one picked", () => {
    render(<EventLogScreenSetting />)
    expect(screen.getByTestId("event-log-screen-smart").getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByTestId("event-log-screen-legacy"))
    expect(mocks.patch).toHaveBeenCalledWith({ eventLogScreen: "legacy" })
  })
})
