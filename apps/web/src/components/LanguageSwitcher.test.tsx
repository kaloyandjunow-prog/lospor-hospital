// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  selectDeviceLocale: vi.fn(async () => "en"),
  setAccountLocale: vi.fn(async () => "en"),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/app/actions/locale", () => ({
  selectDeviceLocale: mocks.selectDeviceLocale,
  setAccountLocale: mocks.setAccountLocale,
}))

import { LanguageSwitcher } from "./LanguageSwitcher"

describe("LanguageSwitcher", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows prominent self-identifying Bulgarian and English choices", () => {
    render(<LanguageSwitcher currentLocale="bg" prominent />)
    expect(screen.getByRole("button", { name: "Български" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("false")
  })

  it("marks an explicit choice made on the login screen", async () => {
    render(<LanguageSwitcher currentLocale="bg" context="login" />)
    fireEvent.click(screen.getByRole("button", { name: "English" }))
    await waitFor(() => {
      expect(mocks.selectDeviceLocale).toHaveBeenCalledWith("en", "login")
      expect(mocks.refresh).toHaveBeenCalled()
    })
  })
})
