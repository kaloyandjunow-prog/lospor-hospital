import { describe, expect, it } from "vitest"
import en from "../../messages/en.json"
import bg from "../../messages/bg.json"
import { aiScanFailureKey } from "./ai-scan-failure"

const lookup = (messages: unknown, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)

describe("the message for a failed lab scan", () => {
  it("names the cause the server gave", () => {
    expect(aiScanFailureKey(403)).toBe("intraop.lab.scanFailures.consentNotSaved")
    expect(aiScanFailureKey(413)).toBe("intraop.lab.scanFailures.imageTooLarge")
    expect(aiScanFailureKey(400)).toBe("intraop.lab.scanFailures.imageFormat")
    expect(aiScanFailureKey(429)).toBe("intraop.lab.scanFailures.tooMany")
    expect(aiScanFailureKey(503, "EXTERNAL_AI_MODEL_UNAVAILABLE")).toBe("intraop.lab.scanFailures.modelUnavailable")
    expect(aiScanFailureKey(503)).toBe("intraop.lab.scanFailures.notConfigured")
    expect(aiScanFailureKey(504)).toBe("intraop.lab.scanFailures.timeout")
    expect(aiScanFailureKey(500)).toBe("intraop.lab.scanFailed")
  })

  it("has every message in both languages", () => {
    for (const status of [403, 413, 400, 429, 503, 504, 500]) {
      for (const code of [undefined, "EXTERNAL_AI_MODEL_UNAVAILABLE"]) {
        const key = aiScanFailureKey(status, code)
        expect(typeof lookup(en, key), `en ${key}`).toBe("string")
        expect(typeof lookup(bg, key), `bg ${key}`).toBe("string")
      }
    }
  })
})
