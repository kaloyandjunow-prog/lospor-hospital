import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "bg" }) }))
const presence = vi.fn()
vi.mock("@/lib/use-case-presence", () => ({ useCasePresence: (...args: unknown[]) => presence(...args) }))

import { getByText, queryByText, render } from "@/test/render"
import { CasePresenceBanner } from "./CasePresenceBanner"

describe("the case presence notice", () => {
  it("names everyone who has the case open", () => {
    presence.mockReturnValue({ people: [{ name: "Мария", you: true }, { name: "Иван", you: false }], screens: 2 })
    const tree = render(<CasePresenceBanner caseId="case-1" />)
    expect(getByText(tree, "Случаят е отворен от: Мария (вие), Иван")).toBeTruthy()
  })

  it("is not there while the screen is alone", () => {
    presence.mockReturnValue({ people: [{ name: "Мария", you: true }], screens: 1 })
    const tree = render(<CasePresenceBanner caseId="case-1" />)
    expect(queryByText(tree, "Случаят е отворен от: Мария (вие)")).toBeNull()
  })
})
