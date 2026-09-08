import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// NumberStepper clears with `null`. Any schema field bound to one must accept
// null, because `z.coerce.number()` turns it into 0 — Number(null) === 0 — and
// a cleared measurement would be stored as a real recorded zero.
//
// This was not hypothetical: paedScore was stepper-backed and non-nullable, so
// clearing it recorded PAED 0, "no emergence delirium", for a score nobody
// assessed. The blanket conversion that made the other fields nullable matched
// only the exact text `z.coerce.number().optional()` and skipped every field
// with a .min()/.max() in the chain.
//
// Reading the source keeps this honest: the pairing is between a JSX binding
// and a schema line, and nothing at runtime relates the two.
const FORMS = [
  "PreopForm.tsx",
  "PostopForm.tsx",
  "PediatricPreopSections.tsx",
  "sections/DrugsFluidTotalsSection.tsx",
]

const SCHEMAS = ["preopSchema.ts", "intraopSchema.ts", "postopSchema.ts"]

function read(relative: string): string {
  return readFileSync(join(__dirname, relative), "utf8")
}

/**
 * Field names bound to a Controller whose render uses a stepper.
 *
 * The stepper sits within a few lines of its Controller. Without that bound a
 * Controller for an unrelated boolean matches the next stepper further down the
 * file and the test reports a field that was never numeric.
 */
const STEPPER_WINDOW = 6

function stepperBoundFields(source: string): string[] {
  const found = new Set<string>()
  const lines = source.split("\n")
  lines.forEach((line, index) => {
    const name = /Controller\s+name="([A-Za-z0-9_]+)"/.exec(line)
    if (!name) return
    const window = lines.slice(index, index + STEPPER_WINDOW).join("\n")
    // A nested Controller means the stepper below belongs to that one instead.
    const nested = window.indexOf("Controller name=", line.length)
    const scoped = nested === -1 ? window : window.slice(0, nested)
    if (/NumberStepper|ConvertedStepper/.test(scoped)) found.add(name[1])
  })
  return [...found]
}

describe("every stepper-backed field accepts a clear", () => {
  const schemaSource = SCHEMAS.map(read).join("\n")
  // Required fields have no `.optional()`: clearing them fails validation with
  // "required", which is the correct outcome and not a silent zero.
  const required = new Set(["heightCm", "weightKg"])

  const fields = [...new Set(FORMS.flatMap(form => stepperBoundFields(read(form))))]

  /**
   * A clinical number is declared through one of the section helpers, which
   * read their bounds from core's rule table, or as a bare coerced number.
   * `postopNumber` is nullable inside the helper -- checked below -- so a
   * postoperative field needs no `.nullable()` of its own.
   */
  const DECLARATION = "(?:z\\.coerce\\.number\\(\\)|preopNumber\\([^)]*\\)|intraopNumber\\([^)]*\\)|postopNumber\\([^)]*\\))"
  const SELF_NULLABLE = /^postopNumber\(/

  it("finds the stepper bindings at all", () => {
    // Guards against the regex silently matching nothing and the suite passing
    // vacuously if the forms are restructured.
    expect(fields.length).toBeGreaterThan(8)
    expect(fields).toContain("paedScore")
  })

  it("keeps the postoperative helper nullable, which its fields rely on", () => {
    const helper = /const postopNumber = [\s\S]*?\n\}/.exec(read("postopSchema.ts"))
    expect(helper?.[0]).toContain(".nullable()")
  })

  it.each(fields.filter(field => !required.has(field)))("%s is nullable", field => {
    const declaration = new RegExp(`\\b${field}:\\s*${DECLARATION}[^,\\n]*`).exec(schemaSource)

    expect(declaration, `${field} has no clinical number declaration`).not.toBeNull()
    const text = declaration![0].slice(declaration![0].indexOf(":") + 1).trim()
    if (SELF_NULLABLE.test(text)) return
    expect(text).toContain("nullable")
  })
})
