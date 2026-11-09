import React from "react"
import { act } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dialogs = vi.hoisted(() => ({
  notify: vi.fn(),
  confirmAction: vi.fn(async () => true),
}))
const readiness = vi.hoisted(() => ({
  value: { valid: true, issues: [], blockers: [] as { code: string }[], warnings: [] as { code: string }[] },
}))

vi.mock("@/lib/notify", () => dialogs)
vi.mock("@/lib/preferences-context", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/preferences-context")>(),
  usePreferences: () => ({ tc: (key: string) => key, language: "en" }),
}))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))
vi.mock("@lospor/core/clinical-validation", async importOriginal => ({
  ...await importOriginal<typeof import("@lospor/core/clinical-validation")>(),
  evaluateIntraopReadiness: () => readiness.value,
}))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopCaseLifecycle } from "./use-intraop-case-lifecycle"

/**
 * End case on the PWA (10.1.0): it always opens its sheet, because the sheet
 * is where End at lives -- a case charted afterwards usually has nothing
 * running and nothing to answer, and used to end at "now" without asking.
 */
function harness(options: { endedAt?: Date | null; log?: LogEvent[] } = {}) {
  const log = options.log ?? []
  const syncLog = vi.fn(async (_next: LogEvent[]) => true)
  const setCaseEndTime = vi.fn()
  const save = vi.fn(async () => {})
  const saveTiming = vi.fn(async () => {})
  let lifecycle!: ReturnType<typeof useIntraopCaseLifecycle>
  function Harness() {
    lifecycle = useIntraopCaseLifecycle({
      startRef: { current: new Date("2026-10-29T06:00:00.000Z") },
      setElapsedMs: () => {},
      setCaseInfo: () => {},
      setCaseStartTime: () => {},
      setCaseEndTime,
      setCaseEndNextDay: () => {},
      caseTimezone: "Europe/Sofia",
      save: save as never,
      saveTiming: saveTiming as never,
      patchIntraopSection: vi.fn(async () => {}) as never,
      cancelLabel: "Cancel",
      activeAgents: [],
      activeGas: null as never,
      activeInfusions: [],
      activeFluids: [],
      stopAgent: vi.fn(),
      stopGasSettings: vi.fn(),
      stopInfusion: vi.fn(),
      stopFluidDirect: vi.fn(),
      getReadinessInput: () => ({}),
      timeline: {
        caseId: "case-1",
        log,
        logRef: { current: log },
        syncLog,
        removeEvent: vi.fn(async () => {}),
        labelOf: () => "",
        endedAtRef: { current: options.endedAt ?? null },
        resyncActiveRef: { current: () => {} },
        vitals: null,
      },
    })
    return null
  }
  render(<Harness />)
  return { get: () => lifecycle, setCaseEndTime, save, saveTiming, syncLog }
}

describe("End case on the PWA", () => {
  beforeEach(() => {
    dialogs.notify.mockClear()
    dialogs.confirmAction.mockReset().mockResolvedValue(true)
    readiness.value = { valid: true, issues: [], blockers: [], warnings: [] }
  })

  it("opens its sheet with nothing running and nothing to answer, and ends nothing yet", async () => {
    const view = harness()
    await act(async () => { await view.get().openEndCase() })
    expect(view.get().endCaseOpen).toBe(true)
    expect(view.get().endCaseRunningItems).toEqual([])
    expect(dialogs.confirmAction).not.toHaveBeenCalled()
    expect(view.setCaseEndTime).not.toHaveBeenCalled()
    expect(view.saveTiming).not.toHaveBeenCalled()
    expect(view.save).not.toHaveBeenCalled()
  })

  it("asks first about incomplete sections, and opens the sheet only on Continue", async () => {
    readiness.value = { ...readiness.value, warnings: [{ code: "missing_airway" }] }
    dialogs.confirmAction.mockResolvedValueOnce(false)
    const view = harness()
    await act(async () => { await view.get().openEndCase() })
    expect(dialogs.confirmAction).toHaveBeenCalledTimes(1)
    expect(view.get().endCaseOpen).toBe(false)
    await act(async () => { await view.get().openEndCase() })
    expect(view.get().endCaseOpen).toBe(true)
  })

  it("does not open while required information is missing", async () => {
    readiness.value = { ...readiness.value, valid: false, blockers: [{ code: "missing_start_time" }] }
    const view = harness()
    await act(async () => { await view.get().openEndCase() })
    expect(dialogs.notify).toHaveBeenCalledWith("requiredInfoMissing", expect.stringContaining("completeBeforeEnding"))
    expect(view.get().endCaseOpen).toBe(false)
  })
})

describe("End at, with entries after the chosen end (10.1.0)", () => {
  beforeEach(() => {
    readiness.value = { valid: true, issues: [], blockers: [], warnings: [] }
  })

  // Charted afterwards: the case really ended at 08:00, and a drug sits at 08:30.
  const late = { id: "late-drug", type: "drug", ts: "2026-10-29T08:30:00.000Z", name: "Ondansetron", dose: "4", unit: "mg" } as LogEvent

  it("asks about them in the sheet as soon as End at is chosen, and no longer once End now is back", async () => {
    const view = harness({ log: [late] })
    await act(async () => { await view.get().openEndCase() })
    expect(view.get().afterEndItems).toEqual([])
    await act(async () => { view.get().setChosenEndTs("2026-10-29T08:00:00.000Z") })
    expect(view.get().afterEndItems.map(item => [item.id, item.kind])).toEqual([["late-drug", "after_end"]])
    await act(async () => { view.get().setChosenEndTs(null) })
    expect(view.get().afterEndItems).toEqual([])
  })

  it("moves an entry that happened to the chosen end", async () => {
    const view = harness({ log: [late] })
    await act(async () => { await view.get().openEndCase() })
    await act(async () => { view.get().setChosenEndTs("2026-10-29T08:00:00.000Z") })
    await act(async () => { await view.get().resolveAfterEnd("late-drug", "happened") })
    const saved = view.syncLog.mock.calls[0][0]
    expect(saved.find(event => event.id === "late-drug")?.ts).toBe("2026-10-29T08:00:00.000Z")
  })

  it("forgets the chosen end when End case is opened again", async () => {
    const view = harness({ log: [late] })
    await act(async () => { await view.get().openEndCase() })
    await act(async () => { view.get().setChosenEndTs("2026-10-29T08:00:00.000Z") })
    await act(async () => { await view.get().openEndCase() })
    expect(view.get().afterEndItems).toEqual([])
  })
})
