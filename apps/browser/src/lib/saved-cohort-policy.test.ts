import { describe, expect, it } from "vitest"
import { canManageSavedCohort, savedCohortPatch } from "./saved-cohort-policy"

describe("saved cohort policy", () => {
  it("offers mutation only to the exact owner with save permission", () => {
    const cohort = { ownerId: "owner-1" }
    expect(canManageSavedCohort(cohort, "owner-1", true)).toBe(true)
    expect(canManageSavedCohort(cohort, "other-user", true)).toBe(false)
    expect(canManageSavedCohort(cohort, "", true)).toBe(false)
    expect(canManageSavedCohort(cohort, "owner-1", false)).toBe(false)
  })

  it("normalizes editable metadata without rewriting unchanged visibility", () => {
    expect(savedCohortPatch({
      name: "  My cohort  ",
      description: "  Review population  ",
      visibility: "INSTITUTION",
      originalVisibility: "INSTITUTION",
    }, false)).toEqual({
      name: "My cohort",
      description: "Review population",
    })
  })

  it("allows an owner to make a shared cohort private after sharing is revoked", () => {
    expect(savedCohortPatch({
      name: "My cohort",
      description: " ",
      visibility: "PRIVATE",
      originalVisibility: "INSTITUTION",
    }, false)).toEqual({
      name: "My cohort",
      description: null,
      visibility: "PRIVATE",
    })
  })

  it("rejects an empty name and unauthorized widening", () => {
    expect(() => savedCohortPatch({
      name: " ",
      description: "",
      visibility: "PRIVATE",
      originalVisibility: "PRIVATE",
    }, true)).toThrow("COHORT_NAME_REQUIRED")
    expect(() => savedCohortPatch({
      name: "My cohort",
      description: "",
      visibility: "INSTITUTION",
      originalVisibility: "PRIVATE",
    }, false)).toThrow("COHORT_SHARE_FORBIDDEN")
  })
})
