import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"

// The intraop screen's header options are one object for the life of the app
// (9.13.0). expo-router re-applies options whenever the object changes, which
// sets the navigator's state; a new object on every render of this busy
// screen was half of the loop that stopped the app on opening a case.

const seen = vi.hoisted(() => [] as unknown[])
vi.mock("expo-router", () => ({ Stack: { Screen: (props: { options: unknown }) => { seen.push(props.options); return null } } }))
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }))
vi.mock("@/components/EditWindowBanner", () => ({ EditWindowBanner: () => null }))
vi.mock("@/components/WatchingOverlay", () => ({ WatchingOverlay: () => null }))
vi.mock("@/components/intraop/CaseEndedBanner", () => ({ CaseEndedBanner: () => null }))
vi.mock("@/components/intraop/IntraopMonitorHeader", () => ({ IntraopMonitorHeader: () => null }))
vi.mock("@/components/intraop/IntraopTabBar", () => ({ IntraopTabBar: () => null }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))

import { IntraopScreenChrome } from "./IntraopScreenChrome"

describe("the intraop screen's header options", () => {
  it("are the same object on every render, and hide the stack header", () => {
    const props = { caseId: "c", isWatching: false, onTakeover: async () => {}, monitor: {} as never, tabBar: {} as never }
    const tree = render(<IntraopScreenChrome {...props}>{null}</IntraopScreenChrome>)
    for (let step = 0; step < 3; step += 1) {
      act(() => { tree.update(<IntraopScreenChrome {...props} isWatching={step % 2 === 0}>{null}</IntraopScreenChrome>) })
    }
    expect(seen.length).toBeGreaterThanOrEqual(4)
    expect(new Set(seen).size).toBe(1)
    expect(seen[0]).toEqual({ headerShown: false })
  })
})
