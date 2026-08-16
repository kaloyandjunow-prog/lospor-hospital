import type { OmopTableName } from "@lospor/exchange-contract"

const HEADERS: Record<OmopTableName, readonly string[]> = {
  person: [
    "person_id", "gender_concept_id", "year_of_birth", "month_of_birth",
    "day_of_birth", "birth_datetime", "race_concept_id",
    "ethnicity_concept_id", "person_source_value", "gender_source_value",
  ],
  observation_period: [
    "observation_period_id", "person_id", "observation_period_start_date",
    "observation_period_end_date", "period_type_concept_id",
  ],
  visit_occurrence: [
    "visit_occurrence_id", "person_id", "visit_concept_id",
    "visit_start_date", "visit_end_date", "visit_type_concept_id",
    "visit_source_value", "care_site_source_value",
  ],
  condition_occurrence: [
    "condition_occurrence_id", "person_id", "condition_concept_id",
    "condition_start_date", "condition_type_concept_id",
    "condition_source_value", "visit_occurrence_id",
  ],
  drug_exposure: [
    "drug_exposure_id", "person_id", "drug_concept_id",
    "drug_exposure_start_date", "drug_exposure_end_date", "drug_type_concept_id", "drug_source_value",
    "drug_source_concept_id", "dose_value", "dose_unit_source_value",
    "route_source_value", "visit_occurrence_id",
  ],
  measurement: [
    "measurement_id", "person_id", "measurement_concept_id",
    "measurement_date", "measurement_datetime", "measurement_type_concept_id",
    "value_as_number", "unit_concept_id", "unit_source_value",
    "measurement_source_value", "visit_occurrence_id",
  ],
  procedure_occurrence: [
    "procedure_occurrence_id", "person_id", "procedure_concept_id",
    "procedure_date", "procedure_type_concept_id", "procedure_source_value",
    "visit_occurrence_id",
  ],
  observation: [
    "observation_id", "person_id", "observation_concept_id",
    "observation_date", "observation_type_concept_id", "value_as_number", "value_as_string",
    "observation_source_value", "visit_occurrence_id",
  ],
}

function cell(value: unknown): string {
  if (value == null) return ""
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function omopTableCsv(
  table: OmopTableName,
  rows: readonly Record<string, unknown>[],
): Buffer {
  const headers = HEADERS[table]
  const lines = [
    headers.join(","),
    ...rows.map(row => headers.map(header => cell(row[header])).join(",")),
  ]
  return Buffer.from(`${lines.join("\n")}\n`, "utf8")
}

