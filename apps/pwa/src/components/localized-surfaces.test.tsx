import React from "react"
import { describe, expect, it, vi } from "vitest"
import { getByText, queryByText, render } from "@/test/render"
import { MedicalDisclaimer } from "./MedicalDisclaimer"
import { IntraopMonitorHeader } from "./intraop/IntraopMonitorHeader"
import { SupportDiagnosticPreview } from "./SupportDiagnosticPreview"
import { createIntraopSyncStatusStore } from "@/lib/intraop-sync-status"

const baseStrings: Record<string, string> = {
  medicalDisclaimer: "LOSPOR е инструмент за документация и научни изследвания, а не медицинско изделие.",
  syncFailed: "Неуспешна синхронизация",
}

const clinicalStrings: Record<string, string> = {
  caseSaveFailed: "Случаят не можа да бъде запазен. Проверете връзката и опитайте отново.",
  complicationsTitle: "Усложнения",
  draftSaving: "Запазва се…",
  mhRetrySync: "Синхронизирай отново",
}

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    language: "bg",
    t: (key: string) => baseStrings[key] ?? key,
    tc: (key: string) => clinicalStrings[key] ?? key,
  }),
}))

describe("Bulgarian render contracts", () => {
  it("renders the medical disclaimer in Bulgarian", () => {
    const tree = render(<MedicalDisclaimer />)
    expect(getByText(tree, baseStrings.medicalDisclaimer)).toBeTruthy()
  })

  it("never exposes a raw server error in the Bulgarian sync badge", () => {
    // The header reads save status from the store now rather than from props,
    // so the failure this asserts has to be put there.
    const failedSyncStore = createIntraopSyncStatusStore()
    failedSyncStore.set({ syncState: "failed", pendingCount: 1, lastSavedAt: null })
    const tree = render(
      <IntraopMonitorHeader
        techniquesLabel="TIVA"
        procedure="Procedure"
        timeStr="12:00"
        started
        elapsedMs={0}
        onStartNow={vi.fn()}
        onStartAt={vi.fn()}
        syncStatusStore={failedSyncStore}
        onRetrySync={vi.fn()}
      />,
    )

    expect(getByText(tree, clinicalStrings.caseSaveFailed)).toBeTruthy()
    expect(getByText(tree, "Синхронизирай отново")).toBeTruthy()
    expect(queryByText(tree, "Database exploded")).toBeNull()
  })

  it("renders the privacy boundary beside a selectable support preview", () => {
    const tree = render(
      <SupportDiagnosticPreview
        title="Преглед на диагностиката"
        notice="Не са включени клинични данни."
        report="Версия: 9.3.0"
      />,
    )
    expect(getByText(tree, "Преглед на диагностиката")).toBeTruthy()
    expect(getByText(tree, "Не са включени клинични данни.")).toBeTruthy()
    expect(getByText(tree, "Версия: 9.3.0").props.selectable).toBe(true)
  })
})
