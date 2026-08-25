import { describe, expect, it } from "vitest"
import { STRINGS } from "@/i18n/strings"
import { buildPrivacySafeDiagnosticReport } from "./support-report"

describe("privacy-safe support report", () => {
  it("keeps only bounded operational facts and removes request paths", () => {
    const t = (key: keyof typeof STRINGS.en) => STRINGS.en[key]
    const report = buildPrivacySafeDiagnosticReport({
      generatedAt: "2026-08-23T00:00:00.000Z",
      appVersion: "9.3.0",
      clientVersion: "8.0.0",
      platform: "web",
      language: "en",
      apiMode: "same-origin",
      lastSuccessfulRequest: "2026-08-22T23:59:00.000Z",
      lastRequestError: "500 /api/cases/patient-case-identifier/intraop",
      queuedSaves: 2,
      droppedEvents: 1,
      timingSamples: 4,
    }, t)

    expect(report).toContain("Last request error: HTTP 500")
    expect(report).toContain("Queued local saves: 2")
    expect(report).not.toContain("patient-case-identifier")
    expect(report).not.toMatch(/email|token value|institution id/i)
  })

  it("renders the report labels in Bulgarian", () => {
    const t = (key: keyof typeof STRINGS.en) => STRINGS.bg[key]
    const report = buildPrivacySafeDiagnosticReport({
      generatedAt: "2026-08-23T00:00:00.000Z",
      appVersion: "9.3.0",
      clientVersion: "8.0.0",
      platform: "android",
      language: "bg",
      apiMode: "configured-native-origin",
      lastSuccessfulRequest: null,
      lastRequestError: "Network error /api/cases/secret",
      queuedSaves: -1,
      droppedEvents: Number.NaN,
      timingSamples: 0,
    }, t)

    expect(report).toContain("Диагностика за поддръжка на LOSPOR")
    expect(report).toContain("Последна грешка при заявка: мрежова грешка")
    expect(report).not.toContain("/api/cases/secret")
    expect(report).toContain("Чакащи локални записи: 0")
  })
})
