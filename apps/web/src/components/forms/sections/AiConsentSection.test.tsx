// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"
import { safeClinicalAiCapabilities } from "@lospor/core/deployment-capabilities"
import type { ClinicalAiCapabilities } from "@/lib/deployment-capabilities"
import type { PreopData } from "@/components/forms/preopSchema"
import enMessages from "../../../../messages/en.json"
import { AiConsentSection } from "./AiConsentSection"

vi.mock("@/components/AIAdvisor", () => ({ AIAdvisor: () => <div>advisor</div> }))

const ON = { enabled: true, reason: null } as unknown as ClinicalAiCapabilities["clinicalAdvice"]
const off = safeClinicalAiCapabilities()
const scansOnly: ClinicalAiCapabilities = { ...off, labImageExtraction: ON, monitorOcr: ON }
const everything: ClinicalAiCapabilities = { clinicalAdvice: ON, labImageExtraction: ON, monitorOcr: ON }

function Section({ ai, pediatric, consent }: { ai: ClinicalAiCapabilities; pediatric: boolean; consent: boolean }) {
  const { control, getValues } = useForm<PreopData>({ defaultValues: { aiOptIn: consent } as PreopData })
  return <AiConsentSection control={control} aiOptIn={consent} isPediatric={pediatric} clinicalAi={ai} getFormData={getValues} />
}

function show(ai: ClinicalAiCapabilities, pediatric: boolean, consent = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Section ai={ai} pediatric={pediatric} consent={consent} />
    </NextIntlClientProvider>,
  )
}

const consentBox = () => screen.queryByLabelText(enMessages.preop.aiOptInLabel)

// 9.14.3: the consent moved out of the adult advisor so a paediatric case can
// scan. With AI off in Status nothing new may appear.
describe("the case's AI consent", () => {
  it("shows no consent with every AI feature off, adult or paediatric", () => {
    show(off, false)
    expect(consentBox()).toBeNull()
    expect(screen.queryByText("advisor")).toBeNull()
    show(off, true)
    expect(consentBox()).toBeNull()
  })

  it("asks a paediatric case for consent when scans are on, without the advisor", () => {
    show(scansOnly, true, true)
    expect(consentBox()).not.toBeNull()
    expect(screen.queryByText("advisor")).toBeNull()
  })

  it("keeps the adult advisor behind consent", () => {
    const { unmount } = show(everything, false, false)
    expect(consentBox()).not.toBeNull()
    expect(screen.queryByText("advisor")).toBeNull()
    unmount()
    show(everything, false, true)
    expect(screen.getByText("advisor")).toBeTruthy()
  })

  it("never shows the advisor to a paediatric case", () => {
    show(everything, true, true)
    expect(screen.queryByText("advisor")).toBeNull()
  })
})
