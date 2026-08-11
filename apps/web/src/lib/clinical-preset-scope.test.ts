import { describe, expect, it } from "vitest"
import {
  isEquipmentRule,
  pediatricEditorPayload,
  presetBelongsToContext,
  presetVisibleInContext,
  type PresetActor,
} from "./clinical-preset-scope"

/**
 * Who can see whose dosing rules.
 *
 * These decided that in the middle of a 1,200-line page component, untested.
 * The failure that matters is not a crash: it is one hospital's draft
 * paediatric dosing rules appearing in another hospital's editor, which looks
 * like a working feature to whoever is reading the screen.
 *
 * Ownership and visibility are deliberately different questions, so both are
 * pinned, and the leak cases are asserted from the other institution's side.
 */

const actor: PresetActor = { id: "user-1", institutionId: "inst-a" }
const otherActor: PresetActor = { id: "user-2", institutionId: "inst-b" }

function preset(overrides: Partial<{
  scope: "PLATFORM" | "INSTITUTION" | "USER"
  status: string
  ownerInstitutionId: string | null
  ownerUserId: string | null
}> = {}) {
  return {
    scope: "INSTITUTION" as const,
    status: "PUBLISHED",
    ownerInstitutionId: "inst-a",
    ownerUserId: "user-1",
    ...overrides,
  } as Parameters<typeof presetVisibleInContext>[0]
}

describe("presetBelongsToContext", () => {
  it("treats every platform preset as owned by the platform context", () => {
    expect(presetBelongsToContext(preset({ scope: "PLATFORM" }), "PLATFORM", actor, null)).toBe(true)
  })

  it("gives an institution preset only to the institution that owns it", () => {
    const p = preset({ scope: "INSTITUTION", ownerInstitutionId: "inst-a" })
    expect(presetBelongsToContext(p, "INSTITUTION", actor, "inst-a")).toBe(true)
    expect(presetBelongsToContext(p, "INSTITUTION", otherActor, "inst-b")).toBe(false)
  })

  it("refuses institution ownership when no institution is in context", () => {
    // A null owning institution must not match a preset with a null owner —
    // that would make orphaned presets belong to everyone.
    const p = preset({ scope: "INSTITUTION", ownerInstitutionId: null })
    expect(presetBelongsToContext(p, "INSTITUTION", actor, null)).toBe(false)
  })

  it("gives a personal preset only to the person who made it", () => {
    const p = preset({ scope: "USER", ownerUserId: "user-1" })
    expect(presetBelongsToContext(p, "USER", actor, "inst-a")).toBe(true)
    expect(presetBelongsToContext(p, "USER", otherActor, "inst-b")).toBe(false)
  })

  it("never matches across scopes", () => {
    expect(presetBelongsToContext(preset({ scope: "PLATFORM" }), "INSTITUTION", actor, "inst-a")).toBe(false)
    expect(presetBelongsToContext(preset({ scope: "USER" }), "INSTITUTION", actor, "inst-a")).toBe(false)
  })
})

describe("presetVisibleInContext", () => {
  it("shows published platform rules to institutions and to individuals", () => {
    const p = preset({ scope: "PLATFORM", status: "PUBLISHED" })
    expect(presetVisibleInContext(p, "INSTITUTION", actor, "inst-a")).toBe(true)
    expect(presetVisibleInContext(p, "USER", actor, "inst-a")).toBe(true)
  })

  it("keeps an unpublished preset inside the context that owns it", () => {
    // A draft dosing rule must not leave the institution drafting it.
    const draft = preset({ scope: "INSTITUTION", status: "DRAFT", ownerInstitutionId: "inst-a" })
    expect(presetVisibleInContext(draft, "INSTITUTION", actor, "inst-a")).toBe(true)
    expect(presetVisibleInContext(draft, "INSTITUTION", otherActor, "inst-b")).toBe(false)
    expect(presetVisibleInContext(draft, "USER", otherActor, "inst-b")).toBe(false)
  })

  it("does not leak one institution's published rules into another", () => {
    // The case that would look like a working feature to whoever saw it.
    const p = preset({ scope: "INSTITUTION", status: "PUBLISHED", ownerInstitutionId: "inst-a" })
    expect(presetVisibleInContext(p, "INSTITUTION", otherActor, "inst-b")).toBe(false)
    expect(presetVisibleInContext(p, "USER", otherActor, "inst-b")).toBe(false)
  })

  it("shows an individual their own institution's published rules", () => {
    const p = preset({ scope: "INSTITUTION", status: "PUBLISHED", ownerInstitutionId: "inst-a" })
    expect(presetVisibleInContext(p, "USER", actor, "inst-a")).toBe(true)
  })

  it("shows nothing borrowed in the platform context", () => {
    const p = preset({ scope: "INSTITUTION", status: "PUBLISHED" })
    expect(presetVisibleInContext(p, "PLATFORM", actor, "inst-a")).toBe(false)
  })
})

describe("rule payload narrowing", () => {
  it("recognises the equipment kinds", () => {
    for (const kind of ["ADULT_EQUIPMENT_PROFILE", "PEDIATRIC_EQUIPMENT", "PEDIATRIC_EQUIPMENT_POLICY"]) {
      expect(isEquipmentRule({ kind })).toBe(true)
    }
    expect(isEquipmentRule({ kind: "PEDIATRIC_DRUG_DOSE" })).toBe(false)
  })

  it("returns null for an adult payload instead of casting it", () => {
    // Returning null is what stops an adult payload reaching an editor that
    // would read paediatric fields off it.
    expect(pediatricEditorPayload(null)).toBeNull()
    expect(pediatricEditorPayload({ kind: "ADULT_DRUG_PROFILE" } as never)).toBeNull()
  })

  it("passes the paediatric payloads through", () => {
    for (const kind of [
      "PEDIATRIC_DRUG_DOSE",
      "PEDIATRIC_DRUG_PROFILE",
      "PEDIATRIC_DRUG_POLICY",
      "PEDIATRIC_FLUID_PROFILE",
      "PEDIATRIC_INFUSION_PROFILE",
    ]) {
      expect(pediatricEditorPayload({ kind } as never)).toEqual({ kind })
    }
  })
})
