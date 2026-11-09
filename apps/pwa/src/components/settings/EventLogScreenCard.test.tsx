import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const setEventLogScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, eventLogScreen: "smart", setEventLogScreen }),
}))

import { render } from "@/test/render"
import { EventLogScreenCard } from "./EventLogScreenCard"

describe("the Event log setting on the phone", () => {
  it("offers Timeline stream and Legacy and saves the one picked", () => {
    const tree = render(<EventLogScreenCard />)
    const byId = (id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
    expect(byId("event-log-screen-smart")).toBeDefined()
    act(() => { byId("event-log-screen-legacy")!.props.onPress() })
    expect(setEventLogScreen).toHaveBeenCalledWith("legacy")
  })
})
