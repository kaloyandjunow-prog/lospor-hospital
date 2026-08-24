import { describe, expect, it } from "vitest"
import { auditActionLabel, parseAuditActionDefinitions } from "./audit-actions"

const catalog = [{
  code: "ACCOUNT_ACTIVATE",
  category: "ACCOUNT",
  labels: { bg: "Активиран профил", en: "Account activated" },
}]

describe("API-owned audit action catalog", () => {
  it("renders the API labels in the active Bulgarian or English locale", () => {
    const parsed = parseAuditActionDefinitions(catalog)
    expect(auditActionLabel(parsed, "ACCOUNT_ACTIVATE", "bg-BG")).toBe("Активиран профил")
    expect(auditActionLabel(parsed, "ACCOUNT_ACTIVATE", "en")).toBe("Account activated")
  })

  it("rejects incomplete and duplicate definitions instead of inventing labels", () => {
    expect(parseAuditActionDefinitions([
      ...catalog,
      { ...catalog[0], labels: { bg: "Друго", en: "Other" } },
      { code: "BROKEN", category: "ACCOUNT", labels: { bg: "", en: "Broken" } },
    ])).toEqual(catalog)
  })

  it("keeps an unknown historical code visible and truthful", () => {
    expect(auditActionLabel([], "LEGACY_ACTION", "bg")).toBe("LEGACY_ACTION")
  })
})
