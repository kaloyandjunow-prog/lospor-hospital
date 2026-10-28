import TestRenderer, { act } from "react-test-renderer"
import { Pressable, Text } from "react-native"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en" }) }))

import { PostopCard } from "./PostopCard"
import { stewardCriteria } from "@/lib/postop-aldrete-criteria"
import type { CaseData } from "@/lib/case-detail-summary"

// A child's recovery is scored on Steward, not Aldrete (10.0.0).

const tc = (key: string) => key
const t = (key: string) => key

function texts(node: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer
  act(() => { tree = TestRenderer.create(node) })
  // The card starts collapsed; open it.
  act(() => { tree.root.findAllByType(Pressable)[0].props.onPress() })
  return tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(""))
}

const postop = {
  stewardConsciousness: 2, stewardAirway: 1, stewardMovement: 2, stewardTotal: 5,
  aldreteActivity: null, aldreteRespiration: null, aldreteCirculation: null, aldreteConsciousness: null, aldreteSpO2: null, aldreteTotal: null,
  disposition: "WARD", handoverItems: [],
} as unknown as CaseData["postop"]

describe("the postop card", () => {
  it("shows a child's Steward components and total out of 6", () => {
    const shown = texts(<PostopCard postop={postop} tc={tc as never} t={t as never} pediatric />)
    expect(shown).toContain("summarySteward")
    expect(shown).toContain("stewardAirway")
    expect(shown.some(s => s.startsWith("5/6"))).toBe(true)
    expect(shown).not.toContain("summaryAldrete")
  })

  it("still shows Aldrete for an adult", () => {
    const shown = texts(<PostopCard postop={postop} tc={tc as never} t={t as never} />)
    expect(shown).toContain("summaryAldrete")
    expect(shown).not.toContain("stewardAirway")
  })
})

describe("the Steward criteria", () => {
  it("are consciousness, airway and movement, each with what 0, 1 and 2 mean", () => {
    const criteria = stewardCriteria(tc as never)
    expect(criteria.map(c => c.field)).toEqual(["stewardConsciousness", "stewardAirway", "stewardMovement"])
    expect(criteria.every(c => c.descriptions.length === 3)).toBe(true)
  })
})

describe("the procedure done on the postop card (10.0.0)", () => {
  it("shows what was done, as the web summary does", () => {
    const shown = texts(<PostopCard postop={{ ...postop, performedProceduresJson: [{ label: "Exploratory laparotomy" }, { label: "Right hemicolectomy" }] } as never} tc={tc as never} t={t as never} />)
    expect(shown).toContain("performedProcedureLabel")
    expect(shown).toContain("Exploratory laparotomy; Right hemicolectomy")
  })

  it("shows nothing for it when none is recorded", () => {
    const shown = texts(<PostopCard postop={postop} tc={tc as never} t={t as never} />)
    expect(shown).not.toContain("performedProcedureLabel")
  })
})
