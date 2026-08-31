// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "../../messages/en.json"

const mocks = vi.hoisted(() => ({
  capability: {
    enabled: false,
    reason: "DISABLED_BY_DEPLOYMENT" as
      | "ENABLED"
      | "DISABLED_BY_DEPLOYMENT"
      | "PROVIDER_NOT_CONFIGURED",
  },
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: (reason: string) => reason === "DISABLED_BY_DEPLOYMENT"
    ? "deploymentCapabilities.externalAiDisabled"
    : "deploymentCapabilities.externalAiUnavailable",
  useClinicalAiCapabilities: () => ({
    clinicalAdvice: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    labImageExtraction: mocks.capability,
    monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
  }),
}))

import { LabResults } from "./LabResults"

// Three independent gates govern these controls: whether the deployment allows
// lab-image extraction at all, whether this case consented to AI, and whether
// the case has been saved -- scanning is case-scoped so the server can read
// consent from the record instead of trusting the request. This suite covers the
// deployment axis, so the other two default to satisfied.
function renderLabs(aiOptIn = true, caseId: string | null = "case-1") {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LabResults value={[]} onChange={() => undefined} aiOptIn={aiOptIn} caseId={caseId} />
    </NextIntlClientProvider>,
  )
}

describe("LabResults deployment capability boundary", () => {
  beforeEach(() => {
    mocks.capability.enabled = false
    mocks.capability.reason = "DISABLED_BY_DEPLOYMENT"
  })

  it("does not render any image capture path when external AI is disabled", () => {
    const { container } = renderLabs()

    expect(screen.getByText("External AI is disabled for this installation. Use manual entry.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Scan lab report" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Take a picture" })).toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByText("Add tests manually")).toBeTruthy()
  })

  it("renders capture controls only after the API explicitly enables them", () => {
    mocks.capability.enabled = true
    mocks.capability.reason = "ENABLED"
    const { container } = renderLabs()

    expect(screen.getByRole("button", { name: "Scan lab report" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Take a picture" })).toBeTruthy()
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(2)
  })

  // Scanning sends a photograph of the report — patient name and EGN in the
  // header included — to an external provider, and nothing can redact text in
  // an image. The control was previously offered regardless of consent, while
  // the text beside the consent tickbox promised no names ever leave.
  it("offers no capture path when the case has not consented, even where the deployment allows it", () => {
    mocks.capability.enabled = true
    mocks.capability.reason = "ENABLED"
    const { container } = renderLabs(false)

    expect(screen.queryByRole("button", { name: "Scan lab report" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Take a picture" })).toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    // Explained rather than silently absent, so the clinician knows the
    // feature exists and what turns it on.
    expect(screen.getByText(
      "Scanning a lab report sends the image to the AI provider. Enable AI assistance for this case to use it.",
    )).toBeTruthy()
    // Manual entry is unaffected by any gate.
    expect(screen.getByText("Add tests manually")).toBeTruthy()
  })

  // An unsaved draft has no row for the server to read consent from, so the
  // route it would call does not exist yet. Offering the control here would
  // produce a 404 the clinician cannot act on.
  it("offers no capture path until the case has been saved", () => {
    mocks.capability.enabled = true
    mocks.capability.reason = "ENABLED"
    const { container } = renderLabs(true, null)

    expect(screen.queryByRole("button", { name: "Scan lab report" })).toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByText(
      "Scanning reads consent from the saved case. Save this case first, then scan the report.",
    )).toBeTruthy()
    expect(screen.getByText("Add tests manually")).toBeTruthy()
  })
})
