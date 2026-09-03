/**
 * The one shape a hospital system's answer is turned into.
 *
 * A folder drop, a FHIR bundle and an HL7 v2 message say the same clinical
 * things in three unrelated dialects. Each transport translates into the format
 * below and stops there; nothing downstream — staging, the review screen, the
 * write path — knows which transport a value arrived on. That is what keeps a
 * transport a small plugin instead of a third parallel implementation of the
 * whole feature, and it is why adding HL7 later cannot reshape the review UI.
 *
 * Values here are proposals. Nothing in this module writes to a case: an
 * imported value reaches the record only after a clinician accepts it, through
 * the ordinary case-edit path, as their own edit.
 */

import { convertLabValue } from "./lab-unit-conversion"

/** Which numbering space the hospital system was asked about. */
export type EhrIdentifierType = "IZ" | "EGN"

/**
 * The fields a hospital system is allowed to propose.
 *
 * A closed list, and a safety boundary rather than tidiness. Without it a
 * malformed or hostile message could propose a value for any field the case
 * has, and two of those would be actively dangerous:
 *
 *   clinicalMode — the server refuses any write where age and mode disagree,
 *   so an importer that could set it would walk into the pediatric-to-adult
 *   trap that took three clients to fix. Age may be proposed; the mode it
 *   implies is the clinician's decision, made in front of the warning the form
 *   already shows.
 *
 *   aiOptIn — consent is not something a feed can grant on a patient's behalf.
 *
 * Everything absent from this list is absent deliberately. ASA class, the
 * airway assessment and anything intraoperative are the anaesthetist's own
 * judgement and are not the hospital system's to offer.
 */
export const EHR_IMPORTABLE_FIELDS = {
  // Demographics.
  ageYears: "scalar",
  ageValue: "scalar",
  ageUnit: "scalar",
  sex: "scalar",
  heightCm: "scalar",
  weightKg: "scalar",
  bloodType: "scalar",
  rhFactor: "scalar",

  // Clinical history, all tag lists.
  diagnoses: "tags",
  comorbidities: "tags",
  currentMedications: "tags",
  allergyDetails: "tags",

  // Allergy flags travel with the list they qualify: a hospital saying "no
  // known allergies" is a clinical statement, not an empty field.
  allergies: "scalar",
  latexAllergy: "scalar",

  // The scheduled operation, from the worklist entry that prompted the request.
  procedures: "tags",

  // Results, which alone carry a time — see EhrLabValue.
  labResults: "labs",
} as const

export type EhrImportableField = keyof typeof EHR_IMPORTABLE_FIELDS
export type EhrFieldShape = (typeof EHR_IMPORTABLE_FIELDS)[EhrImportableField]

export function isImportableField(field: string): field is EhrImportableField {
  return Object.prototype.hasOwnProperty.call(EHR_IMPORTABLE_FIELDS, field)
}

/** Every imported value carries where it came from, per item. */
export const EHR_ITEM_SOURCE = "import" as const

export type EhrTagValue = {
  label: string
  /** The hospital's own code, kept verbatim so a mapping failure stays visible. */
  code?: string
  system?: string
  inn?: string
  atcCode?: string
  dose?: string
  route?: string
  frequency?: string
  source: typeof EHR_ITEM_SOURCE
}

export type EhrLabValue = {
  test: string
  value: string
  unit?: string
  /**
   * When the specimen was taken, not when it was sent.
   *
   * Both FHIR and HL7 v2 carry this natively — `Observation.effectiveDateTime`
   * and OBX-14 — so in practice it is missing only from a hand-rolled folder
   * drop. It still cannot be *required*, because refusing every undated result
   * would silently switch the lab half of the feature off at such a site.
   *
   * Null is therefore allowed and means the hospital did not state it. It is
   * never inferred from when the message arrived: dating a six-month-old
   * haemoglobin as today is far worse than admitting the date is unknown. An
   * undated result is shown, labelled, and never pre-selected — the clinician
   * decides whether they can vouch for it.
   */
  takenAt: string | null
  source: typeof EHR_ITEM_SOURCE
  /**
   * What the hospital called this test, when that is not what we call it.
   *
   * Kept because a site can map several of its codes onto one of ours — a main
   * laboratory haemoglobin and a blood-gas one, a legacy code beside its
   * replacement — and once mapped, two results drawn at the same moment become
   * two rows reading "Haemoglobin (Hb)" with different numbers and no way to
   * tell which machine either came from. This is that way.
   */
  reportedTest?: string
  /**
   * The value and unit as the laboratory reported them, when we converted.
   *
   * Shown beside the converted figure rather than replaced by it: a clinician
   * who can see "89 g/L, reported 8.9 g/dL" can catch a wrong mapping, and one
   * who sees only 89 has to trust it.
   */
  reportedValue?: string
  reportedUnit?: string
  /**
   * The unit could not be converted, so the value stands as reported and cannot
   * be trusted against our reference ranges.
   *
   * Never guessed from magnitude — a creatinine of 10 is a plausible neonatal
   * µmol/L and a plausible adult mg/dL. The clinician is shown it and decides.
   */
  unconverted?: true
  /**
   * A test this product does not record.
   *
   * Not the same as an unmapped code. ХГБ is our haemoglobin under a name we
   * have not been told about yet, and belongs in the case as soon as a site
   * says so. This is an analyte we have no field for at all — nothing to read
   * it against, no concept to export it as — so an intensive-care panel of
   * eighty of them has nowhere to land. Shown, so that nothing is hidden;
   * refused, so that nothing unusable is written.
   */
  unsupported?: true
}

export type EhrScalarValue = string | number | boolean | null

export type EhrImportedField =
  | { field: Extract<EhrImportableField, keyof typeof EHR_IMPORTABLE_FIELDS>; shape: "scalar"; value: EhrScalarValue }
  | { field: EhrImportableField; shape: "tags"; value: EhrTagValue[] }
  | { field: EhrImportableField; shape: "labs"; value: EhrLabValue[] }

export type CanonicalEhrImport = {
  identifier: { type: EhrIdentifierType; value: string }
  /** The transport's own message id, for tracing a proposal back to its source. */
  sourceMessageId?: string
  fields: EhrImportedField[]
}

export type EhrImportRejection = {
  field: string
  reason: "not-importable" | "wrong-shape" | "empty"
}

export type EhrImportNormalization = {
  canonical: CanonicalEhrImport
  /**
   * What was dropped and why.
   *
   * Returned rather than thrown: one unusable field must not discard an
   * otherwise good message, and a hospital sending something we do not accept
   * is a normal event worth recording, not an error. The caller logs these so
   * a site integrating for the first time can see exactly what was ignored.
   */
  rejected: EhrImportRejection[]
  /**
   * How many results arrived without a draw time.
   *
   * Not a rejection — they are kept and offered. It is the number an integrator
   * needs to see that their feed is missing OBX-14 or
   * `Observation.effectiveDateTime`, while the clinician still gets the values.
   */
  undatedLabs: number
}

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function optionalText(value: unknown): string | undefined {
  return text(value) ?? undefined
}

function isValidInstant(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  return !Number.isNaN(new Date(value).getTime())
}

function normalizeTags(raw: unknown): EhrTagValue[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    // A code with no label is still worth proposing — the clinician can read
    // ICD-10 — but something with neither names nothing at all.
    const label = text(record.label) ?? text(record.code) ?? text(record.inn)
    if (!label) return []
    return [{
      label,
      code: optionalText(record.code),
      system: optionalText(record.system),
      inn: optionalText(record.inn),
      atcCode: optionalText(record.atcCode),
      dose: optionalText(record.dose),
      route: optionalText(record.route),
      frequency: optionalText(record.frequency),
      source: EHR_ITEM_SOURCE,
    }]
  })
}

function normalizeLabs(raw: unknown): { values: EhrLabValue[]; undated: number } {
  if (!Array.isArray(raw)) return { values: [], undated: 0 }
  let undated = 0
  const values = raw.flatMap(item => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const test = text(record.test)
    const value = text(record.value)
    if (!test || value === null) return []
    // A time that is present but unparseable is treated as absent rather than
    // rescued. Guessing what "12/03" means is how a March result becomes a
    // December one.
    const dated = isValidInstant(record.takenAt)
    if (!dated) undated += 1
    const reportedUnit = optionalText(record.unit)
    const reportedTest = optionalText(record.reportedTest)

    // Convert here rather than at each transport, for the same reason
    // provenance is stamped here: a transport that forgot would put a g/dL
    // haemoglobin into a g/L field, where 8.9 reads as catastrophic anaemia and
    // nothing marks it as wrong.
    const conversion = convertLabValue(test, value, reportedUnit ?? "")
    const converted = conversion.status === "converted"
    const canonical = conversion.status === "converted" || conversion.status === "already-canonical"
    // Only a unit we could not convert makes a value untrustworthy. A test we
    // do not recognise is the ordinary unmapped case, deliberately imported
    // under the hospital's own name and unit until a site maps it; and a value
    // that is not a number — "negative", "<0.01" — is a real result reported the
    // way laboratories report it. Neither is on a scale we could get wrong.
    const unconverted = conversion.status === "unknown-unit"
    // A test this product has no field for. Distinct from a test of ours
    // arriving under a code we do not recognise: ХГБ really is haemoglobin and
    // belongs in the case once a site says so, whereas this has nowhere to go —
    // no reference range to read it against, no concept to export it as. It is
    // shown so that nothing is hidden, and refused so that nothing unusable is
    // stored.
    const unsupported = conversion.status === "unknown-test"

    return [{
      test,
      value: canonical ? String(conversion.value) : value,
      unit: canonical ? conversion.unit : reportedUnit,
      takenAt: dated ? new Date(record.takenAt as string).toISOString() : null,
      source: EHR_ITEM_SOURCE,
      ...(reportedTest && reportedTest !== test ? { reportedTest } : {}),
      ...(converted ? { reportedValue: value, ...(reportedUnit ? { reportedUnit } : {}) } : {}),
      ...(unconverted ? { unconverted: true as const } : {}),
      ...(unsupported ? { unsupported: true as const } : {}),
    }]
  })
  return { values, undated }
}

/**
 * Turn a transport's already-parsed payload into the canonical form.
 *
 * The transport is responsible for its own dialect — reading a file, walking a
 * FHIR bundle, splitting HL7 segments — and hands over plain field names and
 * values. This decides what is acceptable, and everything it accepts is stamped
 * with its provenance here rather than at each call site, so no transport can
 * forget to.
 */
export function normalizeEhrImport(input: {
  identifierType: EhrIdentifierType
  identifier: string
  sourceMessageId?: string
  fields: Record<string, unknown>
}): EhrImportNormalization {
  const rejected: EhrImportRejection[] = []
  let undatedLabs = 0
  const fields: EhrImportedField[] = []

  for (const [field, raw] of Object.entries(input.fields)) {
    if (!isImportableField(field)) {
      rejected.push({ field, reason: "not-importable" })
      continue
    }
    const shape = EHR_IMPORTABLE_FIELDS[field]

    if (shape === "tags") {
      if (!Array.isArray(raw)) { rejected.push({ field, reason: "wrong-shape" }); continue }
      const value = normalizeTags(raw)
      if (!value.length) { rejected.push({ field, reason: "empty" }); continue }
      fields.push({ field, shape, value })
      continue
    }

    if (shape === "labs") {
      if (!Array.isArray(raw)) { rejected.push({ field, reason: "wrong-shape" }); continue }
      const { values, undated } = normalizeLabs(raw)
      undatedLabs += undated
      if (!values.length) { rejected.push({ field, reason: "empty" }); continue }
      fields.push({ field, shape, value: values })
      continue
    }

    // Scalars. A null is a real statement — "no known allergies" — so it is
    // kept, while undefined means the hospital said nothing about this field.
    if (raw === undefined) { rejected.push({ field, reason: "empty" }); continue }
    if (raw !== null && typeof raw === "object") { rejected.push({ field, reason: "wrong-shape" }); continue }
    fields.push({ field, shape, value: raw as EhrScalarValue })
  }

  return {
    canonical: {
      identifier: { type: input.identifierType, value: input.identifier },
      sourceMessageId: input.sourceMessageId,
      fields,
    },
    rejected,
    undatedLabs,
  }
}
