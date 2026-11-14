import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { labScanControlView, labScanLocalFrom, labScanTestSchema } = await import("./lab-scan-settings")

describe("the lab scan's stored settings (1.9.1)", () => {
  it("reads what was saved", () => {
    expect(labScanLocalFrom({ labScanAliases: [{ printed: "ctHb", test: "Haemoglobin (Hb)" }], labScanInstructions: "Note." }))
      .toEqual({ aliases: [{ printed: "ctHb", test: "Haemoglobin (Hb)" }], instructions: "Note." })
  })

  it("runs as released when nothing is set or the stored row no longer passes the checks", () => {
    const released = { aliases: [], instructions: "" }
    expect(labScanLocalFrom(null)).toEqual(released)
    expect(labScanLocalFrom({ labScanAliases: null, labScanInstructions: null })).toEqual(released)
    // A library entry renamed by a later release: the whole row is set aside, not half of it.
    expect(labScanLocalFrom({ labScanAliases: [{ printed: "Hb", test: "Haemoglobin (Hb)" }, { printed: "X", test: "Gone" }], labScanInstructions: "Note." }))
      .toEqual(released)
    expect(labScanLocalFrom({ labScanAliases: "not a list", labScanInstructions: null })).toEqual(released)
  })

  it("offers Status the library names and the limits", () => {
    const view = labScanControlView(null)
    expect(view.libraryNames).toContain("Leucocytes (WBC)")
    expect(view.limits).toEqual({ aliases: 300, printed: 80, instructions: 1500 })
    expect(view.changedAt).toBeNull()
  })

  it("checks a test scan's draft settings as strictly as saved ones", () => {
    const image = { imageBase64: "aaaa", mimeType: "image/jpeg" as const }
    expect(labScanTestSchema.safeParse({ ...image, aliases: [], instructions: "" }).success).toBe(true)
    expect(labScanTestSchema.safeParse({ ...image, aliases: [{ printed: "Hb", test: "Gone" }], instructions: "" }).success).toBe(false)
    expect(labScanTestSchema.safeParse({ ...image, mimeType: "image/gif", aliases: [], instructions: "" }).success).toBe(false)
  })
})
