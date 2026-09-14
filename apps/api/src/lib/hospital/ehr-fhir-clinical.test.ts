import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  mapFhirAllergies,
  encounterDiagnosisRoles,
  mapFhirConditions,
  splitFhirConditions,
  mapFhirMedications,
  mapFhirPlannedProcedures,
  mapFhirSex,
} from "./ehr-fhir-clinical"

const concept = (code: string, display: string, system = "http://hl7.org/fhir/sid/icd-10") =>
  ({ coding: [{ system, code, display }] })

const status = (code: string) => ({ coding: [{ code }] })

describe("conditions", () => {
  it("keeps the hospital's own code beside the label", () => {
    // Never translated here: a code we cannot place is passed through as a
    // labelled tag, which is honest. Guessing at one would put a diagnosis the
    // hospital never made into a patient's record.
    const [tag] = mapFhirConditions([
      { resourceType: "Condition", code: concept("K35.8", "Acute appendicitis") },
    ])
    expect(tag).toMatchObject({
      label: "Acute appendicitis",
      code: "K35.8",
      system: "http://hl7.org/fhir/sid/icd-10",
      source: "import",
    })
  })

  it("drops what the hospital says is over or untrue", () => {
    // Resolved is history, and offering it as a current comorbidity invites a
    // clinician to accept something no longer true. Refuted is stronger still:
    // the hospital is saying this is not the case.
    const tags = mapFhirConditions([
      { resourceType: "Condition", code: concept("I10", "Hypertension"), clinicalStatus: status("resolved") },
      { resourceType: "Condition", code: concept("E11", "Diabetes"), verificationStatus: status("refuted") },
      { resourceType: "Condition", code: concept("J45", "Asthma") },
    ])
    expect(tags.map(t => t.label)).toEqual(["Asthma"])
  })

  it("keeps a condition with no status at all", () => {
    // Plenty of servers omit it, and reading silence as "resolved" would empty
    // the list at those sites.
    expect(mapFhirConditions([
      { resourceType: "Condition", code: concept("J45", "Asthma") },
    ])).toHaveLength(1)
  })

  it("prefers the clinician's own text over a code system's wording", () => {
    const [tag] = mapFhirConditions([
      { resourceType: "Condition", code: { ...concept("I10", "Essential hypertension"), text: "High BP, on ramipril" } },
    ])
    expect(tag.label).toBe("High BP, on ramipril")
  })
})

describe("diagnosis roles from the encounter", () => {
  const role = (code: string, system = "http://terminology.hl7.org/CodeSystem/diagnosis-role") => ({ coding: [{ system, code }] })
  const condition = (id: string, label: string) => ({ resourceType: "Condition", id, code: { text: label } })

  it("reads FHIR diagnosis-role codes and NHIS CL076 keys, in R4 and R5 shapes", () => {
    const roles = encounterDiagnosisRoles({
      resourceType: "Encounter",
      diagnosis: [
        { condition: { reference: "Condition/a" }, use: role("CM") },
        { condition: { reference: { reference: "https://fhir.example.org/r5/Condition/b" } }, use: [role("4", "urn:nhis:CL076")] },
        { condition: { reference: "Condition/c" }, use: role("billing") },
        { condition: { reference: "Condition/d" }, use: role("7", "http://example.org/other-list") },
      ],
    })
    expect([...roles.get("a") ?? []]).toEqual(["comorbidity"])
    expect([...roles.get("b") ?? []]).toEqual(["comorbidity"])
    expect([...roles.get("c") ?? []]).toEqual(["billing"])
    // A key is only an NHIS CL076 key in a system that says so.
    expect(roles.has("d")).toBe(false)
  })

  it("keeps a condition a diagnosis unless the stay names it only a comorbidity or only billing", () => {
    const roles = encounterDiagnosisRoles({
      resourceType: "Encounter",
      diagnosis: [
        { condition: { reference: "Condition/main" }, use: role("AD") },
        { condition: { reference: "Condition/both" }, use: role("CM") },
        { condition: { reference: "Condition/both" }, use: role("DD") },
        { condition: { reference: "Condition/co" }, use: role("CM") },
        { condition: { reference: "Condition/bill" }, use: role("billing") },
      ],
    })
    const { diagnoses, comorbidities } = splitFhirConditions([
      condition("main", "Appendicitis"), condition("both", "Diabetes"), condition("co", "Hypertension"),
      condition("bill", "Appendicitis (billing)"), condition("none", "Asthma"),
    ], roles)
    expect(diagnoses.map(t => t.label)).toEqual(["Appendicitis", "Diabetes", "Asthma"])
    expect(comorbidities.map(t => t.label)).toEqual(["Hypertension"])
  })

  it("imports everything as a diagnosis when there is no encounter", () => {
    expect(encounterDiagnosisRoles(null).size).toBe(0)
    expect(splitFhirConditions([condition("x", "Asthma")], new Map()).diagnoses).toHaveLength(1)
  })
})

describe("allergies and the flags that qualify them", () => {
  it("sets the flag from a real allergy", () => {
    const result = mapFhirAllergies([
      { resourceType: "AllergyIntolerance", code: concept("372687004", "Amoxicillin") },
    ])
    expect(result.allergies).toBe(true)
    expect(result.tags.map(t => t.label)).toEqual(["Amoxicillin"])
  })

  it("reads a stated no-known-allergies as a false, not as silence", () => {
    // The distinction the field exists for: somebody asked and the answer was
    // no, which is not the same as nobody having asked.
    const result = mapFhirAllergies([
      { resourceType: "AllergyIntolerance", code: concept("716186003", "No known allergy") },
    ])
    expect(result.allergies).toBe(false)
    expect(result.tags).toHaveLength(0)
  })

  it("says nothing when the server said nothing", () => {
    expect(mapFhirAllergies([]).allergies).toBeUndefined()
  })

  it("lets a real allergy win over a contradicting negation", () => {
    // A server carrying both is contradicting itself, and the safe reading of a
    // contradiction about an allergy is that one exists.
    const result = mapFhirAllergies([
      { resourceType: "AllergyIntolerance", code: concept("716186003", "No known allergy") },
      { resourceType: "AllergyIntolerance", code: concept("372687004", "Amoxicillin") },
    ])
    expect(result.allergies).toBe(true)
  })

  it("raises the latex flag from either language", () => {
    expect(mapFhirAllergies([
      { resourceType: "AllergyIntolerance", code: concept("111088007", "Latex") },
    ]).latexAllergy).toBe(true)
    expect(mapFhirAllergies([
      { resourceType: "AllergyIntolerance", code: { text: "Алергия към латекс" } },
    ]).latexAllergy).toBe(true)
  })
})

describe("medications", () => {
  it("reads both resource types, because servers disagree about which means current", () => {
    const tags = mapFhirMedications([
      { resourceType: "MedicationStatement", medicationCodeableConcept: concept("B01AC06", "Aspirin"), status: "active" },
      { resourceType: "MedicationRequest", medicationCodeableConcept: concept("C07AB07", "Bisoprolol"), status: "active" },
    ])
    expect(tags.map(t => t.label).sort()).toEqual(["Aspirin", "Bisoprolol"])
  })

  it("collapses the same drug arriving from both", () => {
    const tags = mapFhirMedications([
      { resourceType: "MedicationStatement", medicationCodeableConcept: concept("B01AC06", "Aspirin"), status: "active", dosage: [{ text: "75 mg daily" }] },
      { resourceType: "MedicationRequest", medicationCodeableConcept: concept("B01AC06", "Aspirin"), status: "active", dosageInstruction: [{ text: "75 mg daily" }] },
    ])
    expect(tags).toHaveLength(1)
    expect(tags[0].dose).toBe("75 mg daily")
  })

  it("drops what is not being taken", () => {
    const tags = mapFhirMedications([
      { resourceType: "MedicationStatement", medicationCodeableConcept: concept("N02BE01", "Paracetamol"), status: "stopped" },
      { resourceType: "MedicationRequest", medicationCodeableConcept: concept("B01AC06", "Aspirin"), status: "draft" },
    ])
    expect(tags).toHaveLength(0)
  })

  it("carries dose and route as the free text they are", () => {
    const [tag] = mapFhirMedications([{
      resourceType: "MedicationStatement",
      medicationCodeableConcept: concept("A10BA02", "Metformin"),
      status: "active",
      dosage: [{ text: "1 g twice daily", route: { text: "Oral" } }],
    }])
    expect(tag).toMatchObject({ dose: "1 g twice daily", route: "Oral" })
  })
})

describe("the scheduled operation", () => {
  it("reads a ServiceRequest and an Appointment", () => {
    const tags = mapFhirPlannedProcedures([
      { resourceType: "ServiceRequest", status: "active", code: concept("80146002", "Appendicectomy") },
      { resourceType: "Appointment", status: "booked", serviceType: [concept("112746006", "Cholecystectomy")] },
    ])
    expect(tags.map(t => t.label).sort()).toEqual(["Appendicectomy", "Cholecystectomy"])
  })

  it("ignores one that is already done or called off", () => {
    // This is the only imported field describing what is about to happen, so a
    // finished entry is not a plan for this case.
    expect(mapFhirPlannedProcedures([
      { resourceType: "ServiceRequest", status: "completed", code: concept("80146002", "Appendicectomy") },
      { resourceType: "Appointment", status: "cancelled", serviceType: [concept("112746006", "Cholecystectomy")] },
    ])).toHaveLength(0)
  })
})

describe("sex", () => {
  it("maps the two values the record stores", () => {
    expect(mapFhirSex({ gender: "male" })).toBe("MALE")
    expect(mapFhirSex({ gender: "female" })).toBe("FEMALE")
  })

  it("leaves other and unknown for the anaesthetist", () => {
    // FHIR's administrative gender is not a clinical sex, and this field feeds
    // ideal body weight and several risk scores. Guessing would silently change
    // a dose.
    expect(mapFhirSex({ gender: "other" })).toBeUndefined()
    expect(mapFhirSex({ gender: "unknown" })).toBeUndefined()
    expect(mapFhirSex({})).toBeUndefined()
  })
})
