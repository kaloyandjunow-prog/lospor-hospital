import React from "react"
import { describe, expect, it, vi } from "vitest"
import { queryByText, render } from "@/test/render"
import { suggestASAFromTags } from "@/lib/preop-asa-suggestion"
import { AsaPicker } from "./AsaPicker"

let language = "bg"
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language }) }))
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))

const picker = (value: string | undefined, bmi: number | null) => render(
  <AsaPicker value={value} onChange={vi.fn()} emergencySurgery={false} bmi={bmi}
    suggestion={suggestASAFromTags([{ label: "COPD", code: "J44.9" }], bmi)}
    labelSuggested="Suggested" labelSuggestedReview="review" labelEmergencySuffix="E" />,
)

describe("the ASA suggestion on the PWA", () => {
  it("names its reasons in the clinician's language", () => {
    language = "bg"
    expect(queryByText(picker(undefined, null), "ХОББ")).not.toBeNull()
    language = "en"
    expect(queryByText(picker(undefined, null), "COPD")).not.toBeNull()
  })

  it("is gone once a class is chosen", () => {
    language = "en"
    expect(queryByText(picker("II", null), "COPD")).toBeNull()
  })
})
