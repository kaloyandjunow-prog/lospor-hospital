import { OMOP_COLUMNS, type OmopTableName } from "@/lib/omop-columns"

// One definition, shared with the research export. These were two lists of
// the same thing and they drifted: OBSERVATION gained value_as_number, the
// research list was corrected and this one was not, so every clinical score
// reached Central without its number for a release. Nothing failed, because
// a column that is simply absent raises no error.
const HEADERS = OMOP_COLUMNS

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

