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

function renderLabs() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LabResults value={[]} onChange={() => undefined} />
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
})
