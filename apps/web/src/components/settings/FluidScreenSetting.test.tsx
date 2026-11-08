// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
const mocks = vi.hoisted(() => ({ patch: vi.fn(async () => ({})) }))
vi.mock("@/lib/clinical-preferences-web", () => ({
  readWebClinicalPreferences: () => ({ fluidsScreen: "smart" }),
  syncWebClinicalPreferences: async () => ({ fluidsScreen: "smart" }),
  patchWebClinicalPreferences: mocks.patch,
}))

import { FluidScreenSetting } from "./FluidScreenSetting"

describe("the fluid status setting on the web", () => {
  it("offers Hybrid summary and Legacy and saves the one picked", () => {
    render(<FluidScreenSetting />)
    expect(screen.getByTestId("fluids-screen-smart").getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByTestId("fluids-screen-legacy"))
    expect(mocks.patch).toHaveBeenCalledWith({ fluidsScreen: "legacy" })
  })
})
