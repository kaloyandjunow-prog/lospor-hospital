import React from "react"
import { act, type ReactTestInstance } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { lookupMock, recordMock, capability } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  recordMock: vi.fn(async (..._args: unknown[]) => {}),
  capability: { enabled: true },
}))

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en" }),
}))
vi.mock("@/lib/deployment-capabilities", () => ({
  useDeploymentCapabilities: () => ({ ehrImport: capability }),
}))
vi.mock("@/lib/ehr-import", () => ({
  lookupIntraopEhrLabs: (...args: unknown[]) => lookupMock(...args),
  recordEhrDecisions: (...args: unknown[]) => recordMock(...args),
}))

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan } from "@lospor/core/ehr-import-review"
import { STRINGS } from "@/i18n/strings"
import { render } from "@/test/render"
import { IntraopEhrLabs } from "./IntraopEhrLabs"

const HB = "Haemoglobin (Hb)"
const DRAWN = "2026-09-27T10:30:00.000Z"

function offer() {
  const { canonical } = normalizeEhrImport({
    identifierType: "IZ", identifier: "42",
    fields: { labResults: [{ test: HB, value: "118", unit: "g/L", takenAt: DRAWN }] },
  })
  return { importId: "imp-1", plan: buildEhrReviewPlan({ canonical, current: {} }) }
}

function texts(root: ReactTestInstance): string[] {
  return root.findAll(n => String(n.type) === "Text")
    .map(n => n.children.filter(c => typeof c === "string").join(""))
    .filter(Boolean)
}

function pressable(root: ReactTestInstance, match: (text: string) => boolean) {
  const node = root.findAll(n => typeof n.props?.onPress === "function" && texts(n).some(match))[0]
  expect(node, "no pressable matched").toBeDefined()
  return node
}

async function press(node: ReactTestInstance) {
  await act(async () => { await node.props.onPress() })
}

describe("intraoperative labs from the hospital system", () => {
  beforeEach(() => {
    lookupMock.mockReset()
    recordMock.mockClear()
    capability.enabled = true
  })

  it("asks when pressed and adds the accepted results to the case's labs", async () => {
    lookupMock.mockResolvedValue({ status: "offer", offer: offer() })
    const onChange = vi.fn()
    const existing = [{ test: "Potassium (K⁺)", value: "4.1", unit: "mmol/L", takenAt: "2026-09-27T09:10:00.000Z" }]
    const tree = render(<IntraopEhrLabs caseId="case-1" value={existing} onChange={onChange} />)

    await press(pressable(tree.root, t => t === STRINGS.en.ehrIntraopLabsFetch))
    expect(lookupMock).toHaveBeenCalledWith("case-1")

    await press(pressable(tree.root, t => t.startsWith("ehrAccept")))
    const next = onChange.mock.calls[0][0] as { test: string; takenAt?: string }[]
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(existing[0])
    expect(next[1]).toMatchObject({ test: HB, takenAt: DRAWN })
    expect(recordMock).toHaveBeenCalledWith("case-1", "imp-1", expect.arrayContaining([expect.stringContaining("labResults")]), [])
  })

  it("says so when nothing was drawn, and when the hospital system could not be asked", async () => {
    lookupMock.mockResolvedValueOnce({ status: "none" })
    const tree = render(<IntraopEhrLabs caseId="case-1" value={[]} onChange={vi.fn()} />)
    await press(pressable(tree.root, t => t === STRINGS.en.ehrIntraopLabsFetch))
    expect(texts(tree.root)).toContain(STRINGS.en.ehrIntraopLabsNone)

    lookupMock.mockResolvedValueOnce({ status: "unavailable" })
    await press(pressable(tree.root, t => t === STRINGS.en.ehrIntraopLabsFetch))
    expect(texts(tree.root)).toContain(STRINGS.en.ehrIntraopLabsFailed)
  })

  it("is not shown where the deployment has no hospital-system feed", () => {
    capability.enabled = false
    const tree = render(<IntraopEhrLabs caseId="case-1" value={[]} onChange={vi.fn()} />)
    expect(texts(tree.root)).toEqual([])
  })
})
