import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  assertEgnLinkingPermitted,
  configuredEgnPolicyDefault,
  patientIdentifierCapabilityState,
  PatientIdentifierPolicyError,
} from "./patient-identifier-policy"

// ЕГН is what joins a patient's separate admissions into one person: ИЗ № is
// issued per admission and restarts every January, so without a national
// identifier the same patient returning next year is a different person in
// every export. Recording one is a heavier commitment than a record number
// though, and the hospital is the controller for it — so it is configuration,
// enabled by default, turned off deliberately.

function policyDb(row: { egnPermitted: boolean } | null) {
  return {
    hospitalPatientIdentifierPolicy: { findUnique: vi.fn(async () => row) },
  } as never
}

const original = { ...process.env }

describe("patient identifier policy", () => {
  beforeEach(() => { delete process.env.HOSPITAL_EGN_POLICY_DEFAULT })
  afterAll(() => { process.env = { ...original } })

  it("permits ЕГН when no site has ever configured it", async () => {
    // The case that decides the default for every existing appliance: no row
    // means nobody has made this decision, and doing nothing must not silently
    // narrow what the appliance can record.
    await expect(patientIdentifierCapabilityState(policyDb(null)))
      .resolves.toEqual({ egnPermitted: true })
  })

  it("honours a site that has turned it off", async () => {
    await expect(patientIdentifierCapabilityState(policyDb({ egnPermitted: false })))
      .resolves.toEqual({ egnPermitted: false })
  })

  it("refuses an ЕГН link loudly rather than quietly not making one", async () => {
    // The whole point of the check. A silent skip is indistinguishable from
    // success to the caller, so a site that disabled ЕГН would appear to be
    // linking admissions while recording nothing.
    await expect(assertEgnLinkingPermitted(policyDb({ egnPermitted: false })))
      .rejects.toBeInstanceOf(PatientIdentifierPolicyError)
  })

  it("says nothing when ЕГН is permitted", async () => {
    await expect(assertEgnLinkingPermitted(policyDb({ egnPermitted: true })))
      .resolves.toBeUndefined()
  })

  it("lets a deployment default it off before any row exists", async () => {
    // Opposite polarity to the external-AI default deliberately: that one is
    // off until configured, this one is on until refused.
    process.env.HOSPITAL_EGN_POLICY_DEFAULT = "false"
    expect(configuredEgnPolicyDefault()).toBe(false)
    await expect(patientIdentifierCapabilityState(policyDb(null)))
      .resolves.toEqual({ egnPermitted: false })
  })
})
