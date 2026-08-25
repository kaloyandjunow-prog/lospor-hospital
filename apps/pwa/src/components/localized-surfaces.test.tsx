import React from "react"
import { describe, expect, it, vi } from "vitest"
import { getByText, queryByText, render } from "@/test/render"
import { MedicalDisclaimer } from "./MedicalDisclaimer"
import { ComplicationsSheet } from "./intraop/ComplicationsSheet"
import { IntraopMonitorHeader } from "./intraop/IntraopMonitorHeader"
import { SupportDiagnosticPreview } from "./SupportDiagnosticPreview"

const baseStrings: Record<string, string> = {
  medicalDisclaimer: "LOSPOR е инструмент за документация и научни изследвания, а не медицинско изделие.",
  syncFailed: "Неуспешна синхронизация",
}

const clinicalStrings: Record<string, string> = {
  caseSaveFailed: "Случаят не можа да бъде запазен. Проверете връзката и опитайте отново.",
  clearAll: "Изчистете всички",
  complicationsTitle: "Усложнения",
  complicationSingular: "усложнение",
  complicationPlural: "усложнения",
  draftSaving: "Запазва се…",
  mhRetrySync: "Синхронизирай отново",
  saveLabel: "Запази",
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

  it("renders complication save state and count in Bulgarian", () => {
    const tree = render(
      <ComplicationsSheet
        visible
        onClose={vi.fn()}
        groups={[{ id: "AIRWAY", title: "Airway", items: ["Difficult airway"] }]}
        titleForGroup={group => group.title}
        selected={["Difficult airway"]}
        expanded={{}}
        saving={false}
        onToggleGroup={vi.fn()}
        onToggleItem={vi.fn()}
        onClear={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(getByText(tree, "Усложнения")).toBeTruthy()
    expect(getByText(tree, "Изчистете всички")).toBeTruthy()
    expect(getByText(tree, "Запази (1 усложнение)")).toBeTruthy()
  })

  it("never exposes a raw server error in the Bulgarian sync badge", () => {
    const tree = render(
      <IntraopMonitorHeader
        techniquesLabel="TIVA"
        procedure="Procedure"
        timeStr="12:00"
        started
        elapsedMs={0}
        onStartNow={vi.fn()}
        onStartAt={vi.fn()}
        syncState="failed"
        pendingCount={1}
        lastSavedAt={null}
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
