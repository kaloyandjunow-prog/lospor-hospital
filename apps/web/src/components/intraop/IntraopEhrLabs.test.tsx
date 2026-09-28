// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { lookupMock, recordMock, capability } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  recordMock: vi.fn(async (..._args: unknown[]) => {}),
  capability: { enabled: true },
}))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))
vi.mock("@/lib/deployment-capabilities", () => ({ useEhrImportCapability: () => capability }))
vi.mock("@/lib/ehr-import", () => ({
  lookupIntraopEhrLabs: (...args: unknown[]) => lookupMock(...args),
  recordEhrDecisions: (...args: unknown[]) => recordMock(...args),
}))

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan } from "@lospor/core/ehr-import-review"
import { IntraopEhrLabs } from "./IntraopEhrLabs"

/** Mirrors IntraopEhrLabs.test.tsx in the PWA, case for case. */
const HB = "Haemoglobin (Hb)"
const DRAWN = "2026-09-27T10:30:00.000Z"

function offer() {
  const { canonical } = normalizeEhrImport({
    identifierType: "IZ", identifier: "42",
    fields: { labResults: [{ test: HB, value: "118", unit: "g/L", takenAt: DRAWN }] },
  })
  return { importId: "imp-1", plan: buildEhrReviewPlan({ canonical, current: {} }) }
}

async function click(element: HTMLElement) {
  await act(async () => { fireEvent.click(element) })
}

describe("intraoperative labs from the hospital system", () => {
  beforeEach(() => {
    lookupMock.mockReset()
    recordMock.mockClear()
    capability.enabled = true
  })

  it("asks when pressed and adds the accepted results to the case's labs", async () => {
    lookupMock.mockResolvedValue({ status: "offer", offer: offer() })
    const onChange = vi.fn(async (_rows: unknown[]) => true)
    const existing = [{ test: "Potassium (K⁺)", value: "4.1", unit: "mmol/L", takenAt: "2026-09-27T09:10:00.000Z" }]
    render(<IntraopEhrLabs caseId="case-1" value={existing} onChange={onChange} />)

    await click(screen.getByRole("button", { name: "intraopLabsFetch" }))
    expect(lookupMock).toHaveBeenCalledWith("case-1")

    await click(screen.getByRole("button", { name: /^accept/ }))
    const next = onChange.mock.calls[0][0] as { test: string; takenAt?: string }[]
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(existing[0])
    expect(next[1]).toMatchObject({ test: HB, takenAt: DRAWN })
    expect(recordMock).toHaveBeenCalledWith("case-1", "imp-1", expect.arrayContaining([expect.stringContaining("labResults")]), [])
  })

  it("records nothing when the results did not reach the case, and offers them again", async () => {
    // Recorded before the save, a refused or lost save left the import read
    // as accepted, and the next press said there was nothing new.
    lookupMock.mockResolvedValue({ status: "offer", offer: offer() })
    const onChange = vi.fn(async () => false)
    render(<IntraopEhrLabs caseId="case-1" value={[]} onChange={onChange} />)

    await click(screen.getByRole("button", { name: "intraopLabsFetch" }))
    await click(screen.getByRole("button", { name: /^accept/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(recordMock).not.toHaveBeenCalled()

    await click(screen.getByRole("button", { name: "intraopLabsFetch" }))
    expect(screen.queryByText("intraopLabsNone")).toBeNull()
    expect(screen.getByRole("button", { name: /^accept/ })).toBeTruthy()
  })

  it("does not record before the save has finished", async () => {
    lookupMock.mockResolvedValue({ status: "offer", offer: offer() })
    let finish!: (kept: boolean) => void
    const onChange = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
    render(<IntraopEhrLabs caseId="case-1" value={[]} onChange={onChange} />)
    await click(screen.getByRole("button", { name: "intraopLabsFetch" }))
    await click(screen.getByRole("button", { name: /^accept/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(recordMock).not.toHaveBeenCalled()
    await act(async () => { finish(true) })
    expect(recordMock).toHaveBeenCalledTimes(1)
  })

  it("says so when nothing was drawn, and when the hospital system could not be asked", async () => {
    render(<IntraopEhrLabs caseId="case-1" value={[]} onChange={vi.fn(async () => true)} />)
    lookupMock.mockResolvedValueOnce({ status: "none" })
    await click(screen.getByRole("button", { name: "intraopLabsFetch" }))
    expect(screen.getByText("intraopLabsNone")).toBeTruthy()

    lookupMock.mockResolvedValueOnce({ status: "unavailable" })
    await click(screen.getByRole("button", { name: "intraopLabsFetch" }))
    expect(screen.getByText("intraopLabsFailed")).toBeTruthy()
  })

  it("is not shown where the deployment has no hospital-system feed", () => {
    capability.enabled = false
    const { container } = render(<IntraopEhrLabs caseId="case-1" value={[]} onChange={vi.fn(async () => true)} />)
    expect(container.textContent).toBe("")
  })
})
