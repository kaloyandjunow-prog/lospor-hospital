import React from "react"
import { describe, expect, it } from "vitest"
import { getByText, render } from "@/test/render"
import { colors } from "@/theme/colors"
import { apfelRiskLabel, rcriRiskLabel } from "@/lib/case-detail-summary"
import { ScoreBadge } from "./ScoreBadge"

const colourOf = (tree: ReturnType<typeof render>, text: string) => {
  const style = getByText(tree, text).props.style as { color?: string }
  return style.color
}

describe("a score badge on the preop form", () => {
  // Fifth Consensus Guidelines for PONV: one factor is medium risk (~20%).
  it("colours one Apfel factor as medium", () => {
    const tree = render(<ScoreBadge label="Apfel" score={1} max={4} riskLabel={apfelRiskLabel(1, "en")} />)
    expect(colourOf(tree, "Moderate (~ 20%)")).toBe(colors.warning)
  })

  // One cut-off for every score painted an RCRI of 3 amber though it is high.
  it("colours each score by its own band", () => {
    const tree = render(<ScoreBadge label="RCRI" score={3} max={6} riskLabel={rcriRiskLabel(3, "en")} />)
    expect(colourOf(tree, "High (≥ 5.4%)")).toBe(colors.danger)
  })
})
