import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en" }) }))

import type { LogEvent } from "@/lib/intraop-log-event"
import { render } from "@/test/render"
import { IntraopEventsTab } from "./IntraopEventsTab"

const episode = {
  id: "c1", type: "complication", ts: "2026-11-01T09:10:00.000Z", endTs: "2026-11-01T09:25:00.000Z",
  label: "Hypotension", color: "#ef4444", complicationSource: "vitals",
} as LogEvent
const notNow = { id: "p1", type: "prompt_answer", ts: "2026-11-01T09:30:00.000Z", answerFor: "r", answerKind: "tachycardia", answer: "not_now" } as LogEvent

function tab(log: LogEvent[], selectedComplications: string[] = [], eventLogScreen: "smart" | "legacy" = "smart") {
  const onPromptDelete = vi.fn()
  const onRemoveLegacyComplication = vi.fn()
  const tree = render(
    <IntraopEventsTab
      log={log}
      selectedComplications={selectedComplications}
      complicationsNotes=""
      onComplicationsNotesChange={() => {}}
      onComplicationsNotesBlur={() => {}}
      onRemoveLegacyComplication={onRemoveLegacyComplication}
      onEventActions={() => {}}
      onPromptDelete={onPromptDelete}
      eventLabel={event => ({ text: String(event.label ?? event.type), color: "#fff" })}
      previousVitalFor={() => undefined}
      eventLogScreen={eventLogScreen}
    />,
  )
  return { tree, onPromptDelete, onRemoveLegacyComplication }
}

const ids = (tree: ReturnType<typeof render>) =>
  tree.root.findAll(node => typeof node.props?.testID === "string" && node.props.testID.startsWith("complication-event:")
    || typeof node.props?.testID === "string" && node.props.testID.startsWith("complication-legacy:"))
    .map(node => String(node.props.testID))

describe("the complications list (10.1.0)", () => {
  it("shows the timed entry and the old text's items, and offers no way to add one here", () => {
    const { tree } = tab([episode], ["Bronchospasm"])
    expect([...new Set(ids(tree))]).toEqual(["complication-event:c1", "complication-legacy:0:Bronchospasm"])
    expect(JSON.stringify(tree.toJSON())).toContain("complicationsTimedHint")
    expect(JSON.stringify(tree.toJSON())).not.toContain("addComplication")
  })

  it("deletes a timed entry as the event it is, and an old item from the text", () => {
    const { tree, onPromptDelete, onRemoveLegacyComplication } = tab([episode], ["Bronchospasm"])
    act(() => { tree.root.findAll(node => node.props?.testID === "complication-delete-event:c1")[0]!.props.onPress() })
    expect(onPromptDelete).toHaveBeenCalledWith(episode)
    act(() => { tree.root.findAll(node => node.props?.testID === "complication-delete-legacy:0:Bronchospasm")[0]!.props.onPress() })
    expect(onRemoveLegacyComplication).toHaveBeenCalledWith("Bronchospasm")
  })

  it("never shows a Not now in the event log", () => {
    const { tree } = tab([notNow, episode])
    expect(JSON.stringify(tree.toJSON())).not.toContain("prompt_answer")
  })

  it("counts the complications as recorded, not selected", () => {
    const { tree } = tab([episode], ["Bronchospasm"])
    const json = JSON.stringify(tree.toJSON())
    expect(json).toContain("complicationsRecordedCount")
    expect(json).not.toContain("selectedCount")
  })

  it("adds filters to the Timeline stream and keeps the old list as Legacy", () => {
    const clinical = { id: "e1", type: "clinical_event", ts: "2026-11-01T09:00:00.000Z", label: "Intubated" } as LogEvent
    const vital = { id: "v1", type: "vital", ts: "2026-11-01T09:05:00.000Z", hr: 70 } as LogEvent
    const smart = tab([clinical, vital]).tree
    expect(smart.root.findAll(node => node.props?.testID === "event-log-filter-vitals").length).toBeGreaterThan(0)
    act(() => { smart.root.findAll(node => node.props?.testID === "event-log-filter-vitals")[0]!.props.onPress() })
    expect(smart.root.findAll(node => node.props?.testID === "event-log-filter-vitals")[0]!.props.accessibilityState.selected).toBe(true)
    const legacy = tab([clinical], [], "legacy").tree
    expect(legacy.root.findAll(node => typeof node.props?.testID === "string" && node.props.testID.startsWith("event-log-filter-"))).toHaveLength(0)
  })
})
