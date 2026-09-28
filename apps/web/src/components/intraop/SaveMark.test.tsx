// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "bg" }))

import { CaseSaveStateContext, NO_SAVE_STATE, type CaseSaveState } from "@/lib/use-case-save-state"
import { IntraopAttentionPanel } from "./IntraopAttentionPanel"
import { SaveMark } from "./SaveMark"

// The web chart's save marks and refusals (9.13.0), from Core's rule -- the
// same one the PWA's rows use.

function mark(state: Partial<CaseSaveState>, ids: string[]) {
  return render(
    <CaseSaveStateContext.Provider value={{ ...NO_SAVE_STATE, ...state }}>
      <SaveMark eventIds={ids} />
    </CaseSaveStateContext.Provider>,
  )
}

describe("the save mark on a chart item", () => {
  it("is absent once saved, a clock while queued or saving, a cross when refused", () => {
    expect(mark({}, ["stop"]).container.textContent).toBe("")
    mark({ queuedEventIds: ["stop"] }, ["start", "stop"])
    expect(screen.getByTestId("save-mark-queued").textContent).toBe("◷")
    mark({ queuedEventIds: ["stop"], sendingEventId: "stop" }, ["stop"])
    expect(screen.getByTestId("save-mark-sending")).toBeTruthy()
    mark({ refused: [{ eventId: "start", status: 403, at: "2026-09-27T11:00:00.000Z" }] }, ["start"])
    expect(screen.getByTestId("save-mark-refused").textContent).toBe("✕")
  })
})

describe("refusals above the chart", () => {
  it("are listed in the screen's language until marked seen", () => {
    const dismiss = vi.fn()
    render(
      <IntraopAttentionPanel
        entries={[]}
        refused={[{ key: "stop", time: "14:00", text: "Remifentanil · Спиране на инфузия (промяна) — по-късна промяна е направена на друг екран и остава в сила" }]}
        onDismissRefused={dismiss}
      />,
    )
    expect(screen.getByTestId("intraop-refused").textContent).toContain("14:00 · Remifentanil · Спиране на инфузия")
    fireEvent.click(screen.getByTestId("intraop-refused-dismiss"))
    expect(dismiss).toHaveBeenCalled()
  })
})

describe("the lab results' save mark", () => {
  it("follows the intraop section, which the results are saved with", () => {
    render(
      <CaseSaveStateContext.Provider value={{ ...NO_SAVE_STATE, queuedSections: ["intraop"] }}>
        <SaveMark section="intraop" />
      </CaseSaveStateContext.Provider>,
    )
    expect(screen.getByTestId("save-mark-queued")).toBeTruthy()
  })
})
