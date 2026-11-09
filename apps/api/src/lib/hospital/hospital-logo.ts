import { z } from "zod"

/**
 * The hospital's logo for the paper documents (hospital 1.8.0): a PNG, JPEG
 * or WebP, kept on the hospital's own server as a data URL. Nothing else is
 * accepted -- no SVG, which can carry script, and nothing large enough to slow
 * every printout.
 */
export const HOSPITAL_LOGO_MAX_BYTES = 1024 * 1024

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/

export function parseHospitalLogoDataUrl(value: string): { mime: "image/png" | "image/jpeg" | "image/webp"; bytes: Buffer } | null {
  const match = DATA_URL.exec(value)
  if (!match) return null
  const bytes = Buffer.from(match[2]!, "base64")
  if (bytes.length === 0 || bytes.length > HOSPITAL_LOGO_MAX_BYTES) return null
  const mime = match[1] === "png" ? "image/png" : match[1] === "webp" ? "image/webp" : "image/jpeg"
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isWebp = bytes.length > 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP"
  // The bytes must be what the label says.
  if ((mime === "image/png" && !isPng) || (mime === "image/jpeg" && !isJpeg) || (mime === "image/webp" && !isWebp)) return null
  return { mime, bytes }
}

export const hospitalLogoSchema = z.object({
  institutionId: z.string().trim().min(1).max(128),
  /** The logo as a data URL, or null to remove it. */
  logoDataUrl: z.string().max(Math.ceil(HOSPITAL_LOGO_MAX_BYTES * 4 / 3) + 64).nullable(),
  reason: z.string().trim().min(10).max(1000),
}).strict().refine(value => value.logoDataUrl === null || parseHospitalLogoDataUrl(value.logoDataUrl) !== null, {
  message: "INVALID_LOGO",
  path: ["logoDataUrl"],
})

export function hospitalLogoAuditDetail(configured: boolean, bytes: number, reasonRecorded: boolean) {
  return { logoConfigured: configured, logoBytes: bytes, reasonRecorded }
}
