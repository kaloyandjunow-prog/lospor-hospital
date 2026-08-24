import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EXPLICIT_LOGIN_LOCALE_KEY } from "@/lib/locale"
import {
  LanguageSelector,
  LocaleProvider,
  useLocale,
} from "./locale-provider"
import { LoginContext } from "./login-copy"

function CurrentMessage() {
  const { locale, message } = useLocale()
  return <output>{locale}:{message("signIn")}</output>
}

beforeEach(() => {
  window.sessionStorage.clear()
  document.cookie = "lospor_database_locale=; max-age=0; path=/"
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("LocaleProvider", () => {
  it("starts in Bulgarian and records an explicit pre-auth English choice locally", async () => {
    render(
      <LocaleProvider initialLocale="bg" authenticated={false}>
        <LanguageSelector />
        <CurrentMessage />
        <LoginContext />
      </LocaleProvider>,
    )

    expect(screen.getByText("bg:Вход")).toBeTruthy()
    expect(screen.getByText("От клиничния запис към използваеми доказателства.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "English" }))

    await waitFor(() => expect(screen.getByText("en:Sign in")).toBeTruthy())
    expect(screen.getByText("From clinical record to usable evidence.")).toBeTruthy()
    expect(window.sessionStorage.getItem(EXPLICIT_LOGIN_LOCALE_KEY)).toBe("en")
    expect(document.cookie).toContain("lospor_database_locale=en")
  })

  it("persists an authenticated language change through account preferences", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response)
    render(
      <LocaleProvider initialLocale="bg" authenticated>
        <LanguageSelector compact />
        <CurrentMessage />
      </LocaleProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "EN" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/user", expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ preferences: { ui: { locale: "en" } } }),
      }))
    })
    expect(screen.getByText("en:Sign in")).toBeTruthy()
    expect(window.sessionStorage.getItem(EXPLICIT_LOGIN_LOCALE_KEY)).toBeNull()
  })
})
