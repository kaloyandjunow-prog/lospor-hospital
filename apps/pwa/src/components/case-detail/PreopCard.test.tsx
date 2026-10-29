import TestRenderer, { act } from "react-test-renderer"
import { Text } from "react-native"
import { describe, expect, it, vi } from "vitest"

const { language } = vi.hoisted(() => ({ language: { value: "en" } }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: language.value }) }))

import { PreopCard } from "./PreopCard"
import type { CaseData } from "@/lib/case-detail-summary"

// The preop card names the planned procedure, or says it is not yet known (10.0.0).

const tc = (key: string) => key
const t = (key: string) => key

function texts(preop: Record<string, unknown>) {
  let tree!: TestRenderer.ReactTestRenderer
  act(() => { tree = TestRenderer.create(<PreopCard preop={{ sex: "MALE", ageYears: 50, ...preop } as unknown as CaseData["preop"]} tc={tc as never} t={t as never} />) })
  // The card starts open.
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(""))
}

describe("the planned procedure on the preop card", () => {
  it("names the chosen procedure", () => {
    expect(texts({ plannedProcedure: "Cholecystectomy", proceduresJson: [{ label: "Cholecystectomy" }] })).toContain("Cholecystectomy")
  })

  it("says it is not yet known, rather than showing nothing", () => {
    language.value = "en"
    expect(texts({ plannedProcedure: "", proceduresJson: null, procedureUndetermined: true })).toContain("Procedure not yet known — decided during surgery")
  })

  it("says it in Bulgarian on a Bulgarian screen", () => {
    language.value = "bg"
    expect(texts({ plannedProcedure: "", procedureUndetermined: true })).toContain("Обемът ще се определи по време на операцията")
    language.value = "en"
  })
})
