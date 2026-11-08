import { describe, expect, it } from "vitest"
import { createDrugDraftBuilders } from "./drug-sheet-drafts"
import type { DoseSurface } from "./drug-sheet-types"

const bupivacaine = { name: "Bupivacaine", unit: "mg" } as never
const spinal = { unit: "mg", formulationOptions: ["ISOBARIC", "HYPERBARIC"], defaultFormulation: "ISOBARIC" } as unknown as DoseSurface

function builders(techniques: string[]) {
  return createDrugDraftBuilders({
    pediatricMode: false,
    patientAge: null,
    techniques,
    routes: { Bupivacaine: ["INTRATHECAL", "EPIDURAL"] },
    baseProfiles: {},
    routeProfiles: { Bupivacaine: { INTRATHECAL: spinal, EPIDURAL: spinal } },
    laConcentrations: {},
    dosePresets: {},
  })
}

describe("drug sheet baricity for a unilateral spinal", () => {
  it("opens the intrathecal dose on hyperbaric", () => {
    expect(builders(["SPINAL_UNILATERAL"]).adultDraft(bupivacaine, "INTRATHECAL").formulation).toBe("HYPERBARIC")
  })

  it("keeps the profile's default otherwise", () => {
    expect(builders([]).adultDraft(bupivacaine, "INTRATHECAL").formulation).toBe("ISOBARIC")
    expect(builders(["SPINAL_UNILATERAL"]).adultDraft(bupivacaine, "EPIDURAL").formulation).toBe("ISOBARIC")
  })
})
