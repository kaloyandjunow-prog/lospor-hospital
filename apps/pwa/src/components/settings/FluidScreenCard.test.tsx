import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const setFluidsScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, fluidsScreen: "smart", setFluidsScreen }),
}))

import { render } from "@/test/render"
import { FluidScreenCard } from "./FluidScreenCard"

describe("the fluid status setting on the phone", () => {
  it("offers Hybrid summary and Legacy and saves the one picked", () => {
    const tree = render(<FluidScreenCard />)
    const byId = (id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
    expect(byId("fluids-screen-smart")).toBeDefined()
    act(() => { byId("fluids-screen-legacy")!.props.onPress() })
    expect(setFluidsScreen).toHaveBeenCalledWith("legacy")
  })
})
