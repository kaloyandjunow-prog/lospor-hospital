// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CasePresenceBanner } from "./CasePresenceBanner"

vi.mock("next-intl", () => ({ useLocale: () => "bg" }))
const presence = vi.fn()
vi.mock("@/hooks/useCasePresence", () => ({ useCasePresence: (...args: unknown[]) => presence(...args) }))

describe("the case presence notice", () => {
  it("names everyone who has the case open", () => {
    presence.mockReturnValue({ people: [{ name: "Мария", you: true }, { name: "Иван", you: false }], screens: 2 })
    render(<CasePresenceBanner caseId="case-1" />)
    expect(screen.getByTestId("case-presence").textContent).toBe("Случаят е отворен от: Мария (вие), Иван")
  })

  it("is not there while the screen is alone", () => {
    presence.mockReturnValue({ people: [{ name: "Мария", you: true }], screens: 1 })
    render(<CasePresenceBanner caseId="case-1" />)
    expect(screen.queryByTestId("case-presence")).toBeNull()
  })
})
