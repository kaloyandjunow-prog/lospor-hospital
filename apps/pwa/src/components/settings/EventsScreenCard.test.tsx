import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const setEventsScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en", eventsScreen: "smart", setEventsScreen }),
}))

import { render } from "@/test/render"
import { EventsScreenCard } from "./EventsScreenCard"

describe("the event selector setting on the phone", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    const tree = render(<EventsScreenCard />)
    const byId = (id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
    expect(byId("events-screen-smart")).toBeDefined()
    act(() => { byId("events-screen-legacy")!.props.onPress() })
    expect(setEventsScreen).toHaveBeenCalledWith("legacy")
  })
})
