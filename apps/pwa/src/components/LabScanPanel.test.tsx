import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
const capabilities = vi.hoisted(() => ({ labImageExtraction: { enabled: true, reason: null as string | null } }))
vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "externalAiDisabledDeployment",
  useClinicalAiCapabilities: () => capabilities,
}))

import { LabScanPanel } from "./LabScanPanel"
import { renderWithPreferences } from "./intraop/fluid-sheet-test-fixtures"

function texts(consent: boolean | undefined): string {
  const tree = renderWithPreferences(
    <LabScanPanel value={[]} onAddResults={() => {}} onEnsureCase={async () => "case-1"} aiOptIn={consent} />,
  )
  return tree.root.findAll(n => String(n.type) === "Text")
    .map(n => n.children.filter(c => typeof c === "string").join("")).join(" | ")
}

// Found on the appliance (9.14.3): a case without AI consent offered the
// camera, then answered every photo with "the image could not be read".
describe("the lab scan panel and the case's AI consent", () => {
  it("says consent is missing instead of offering the camera", () => {
    const shown = texts(false)
    expect(shown).toContain("AI assistance is not allowed for this case")
    expect(shown).not.toContain("Camera")
  })

  it("offers the camera once consent is given, or where the caller does not hold it", () => {
    expect(texts(true)).toContain("Camera")
    expect(texts(undefined)).toContain("Camera")
  })

  it("shows only the Status message when scanning is switched off, consent or not", () => {
    capabilities.labImageExtraction = { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" }
    try {
      for (const consent of [false, true, undefined]) {
        const shown = texts(consent)
        expect(shown).not.toContain("Camera")
        expect(shown).not.toContain("AI assistance is not allowed")
      }
    } finally {
      capabilities.labImageExtraction = { enabled: true, reason: null }
    }
  })
})
