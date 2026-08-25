// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EndCaseModal } from "./EndCaseModal"

vi.mock("next-intl", () => ({ useLocale: () => "bg" }))

describe("EndCaseModal Bulgarian safety copy", () => {
  it("renders the end-case decision and confirmation entirely in Bulgarian", () => {
    render(
      <EndCaseModal
        agents={[]}
        infusions={[]}
        fluids={[]}
        weightBasis={{}}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "Приключване на случая — активни елементи" })).toBeTruthy()
    expect(screen.getByText("Няма активни елементи — случаят може да бъде приключен.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Потвърди приключването" })).toBeTruthy()
    expect(screen.queryByText("End Case — Active Items")).toBeNull()
  })
})
