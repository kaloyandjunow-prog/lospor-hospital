import { describe, expect, it } from "vitest"
import { assertSafeAuditDetail } from "@/lib/audit-evidence"
import { HOSPITAL_LOGO_MAX_BYTES, hospitalLogoAuditDetail, hospitalLogoSchema, parseHospitalLogoDataUrl } from "./hospital-logo"

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)])
const url = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`

describe("the hospital logo (1.8.0)", () => {
  it("accepts a PNG or a JPEG whose bytes are what the label says", () => {
    expect(parseHospitalLogoDataUrl(url("image/png", PNG))?.mime).toBe("image/png")
    expect(parseHospitalLogoDataUrl(url("image/jpeg", JPEG))?.mime).toBe("image/jpeg")
  })

  it("refuses SVG, a mislabelled file, an empty one and one that is too large", () => {
    expect(parseHospitalLogoDataUrl(`data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)/>").toString("base64")}`)).toBeNull()
    expect(parseHospitalLogoDataUrl(url("image/png", JPEG))).toBeNull()
    expect(parseHospitalLogoDataUrl(url("image/jpeg", PNG))).toBeNull()
    expect(parseHospitalLogoDataUrl("data:image/png;base64,")).toBeNull()
    expect(parseHospitalLogoDataUrl(url("image/png", Buffer.concat([PNG, Buffer.alloc(HOSPITAL_LOGO_MAX_BYTES)])))).toBeNull()
    expect(parseHospitalLogoDataUrl("https://example.org/logo.png")).toBeNull()
  })

  it("takes a removal (null) with a reason, and refuses a bad picture or a missing reason", () => {
    const base = { institutionId: "inst-1", reason: "The new logo of the hospital" }
    expect(hospitalLogoSchema.safeParse({ ...base, logoDataUrl: url("image/png", PNG) }).success).toBe(true)
    expect(hospitalLogoSchema.safeParse({ ...base, logoDataUrl: null }).success).toBe(true)
    expect(hospitalLogoSchema.safeParse({ ...base, logoDataUrl: "data:image/gif;base64,AAAA" }).success).toBe(false)
    expect(hospitalLogoSchema.safeParse({ ...base, reason: "short", logoDataUrl: null }).success).toBe(false)
  })

  it("audits the fact and the size, never the picture", () => {
    const detail = hospitalLogoAuditDetail(true, 1234, true)
    expect(() => assertSafeAuditDetail(detail)).not.toThrow()
    expect(JSON.stringify(detail)).not.toContain("data:")
  })
})
