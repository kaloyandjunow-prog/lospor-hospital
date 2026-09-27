import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { EHR_IMPORTABLE_FIELDS } from "@lospor/core/ehr-import"

import { EHR_FIELD_LABELS, ehrFieldLabel } from "./ehr-field-labels"

describe("import review field names", () => {
  it("names every field the hospital system can send, in both languages", () => {
    for (const field of Object.keys(EHR_IMPORTABLE_FIELDS)) {
      expect(ehrFieldLabel(field, "en"), field).not.toBe(field)
      expect(ehrFieldLabel(field, "bg"), field).toMatch(/\S/)
    }
    expect(ehrFieldLabel("ageUnit", "bg")).toBe("Единица за възраст")
    expect(Object.keys(EHR_FIELD_LABELS).sort()).toEqual(Object.keys(EHR_IMPORTABLE_FIELDS).sort())
  })

  it("matches the web app's copy word for word", () => {
    const here = readFileSync(resolve(__dirname, "ehr-field-labels.ts"), "utf8").replace(/\r\n/g, "\n")
    const web = readFileSync(resolve(__dirname, "../../../web/src/lib/ehr-field-labels.ts"), "utf8").replace(/\r\n/g, "\n")
    expect(here).toBe(web)
  })
})
