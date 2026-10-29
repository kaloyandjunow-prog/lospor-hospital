import TestRenderer, { act } from "react-test-renderer"
import { PanResponder } from "react-native"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useSectionPager } from "./use-section-pager"

// One section at a time with a swipe, or all of them in one scroll (10.0.0).

type Keys = "vitals" | "score" | "pain" | "discharge"
type Pager = ReturnType<typeof useSectionPager<Keys>>
type Gesture = { dx: number; dy: number; vx: number }
type Config = {
  onMoveShouldSetPanResponder: (event: unknown, gesture: Gesture) => boolean
  onStartShouldSetPanResponderCapture: () => boolean
  onPanResponderRelease: (event: unknown, gesture: Gesture) => void
}

const ALL: Keys[] = ["vitals", "score", "pain", "discharge"]

function mount(keys: Keys[], enabled: boolean) {
  let pager!: Pager
  let configs: Config[] = []
  const create = vi.spyOn(PanResponder, "create").mockImplementation(config => {
    configs.push(config as unknown as Config)
    return { panHandlers: {} } as never
  })
  function Probe({ list, on }: { list: Keys[]; on: boolean }) {
    pager = useSectionPager(list, on, 400)
    return null
  }
  let tree!: TestRenderer.ReactTestRenderer
  act(() => { tree = TestRenderer.create(<Probe list={keys} on={enabled} />) })
  return {
    get pager() { return pager },
    swipe(gesture: Gesture) {
      const config = configs.at(-1)!
      config.onStartShouldSetPanResponderCapture()
      config.onMoveShouldSetPanResponder({}, gesture)
      act(() => { config.onPanResponderRelease({}, gesture) })
    },
    rerender(list: Keys[], on = enabled) { configs = []; act(() => { tree.update(<Probe list={list} on={on} />) }) },
    created: () => create.mock.calls.length,
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe("the section pager", () => {
  it("in the scrolling layout shows every section, claims no swipe, and records the one chosen", () => {
    const view = mount(ALL, false)
    expect(ALL.every(key => view.pager.shown(key))).toBe(true)
    expect(view.pager.panHandlers).toEqual({})
    expect(view.created()).toBe(0)
    act(() => { view.pager.go("pain") })
    expect(view.pager.active).toBe("pain")
    expect(view.pager.style).toBeUndefined()
  })

  it("one section at a time shows only the one open, and a tap on the strip opens another", () => {
    const view = mount(ALL, true)
    expect(view.pager.active).toBe("vitals")
    expect(ALL.filter(key => view.pager.shown(key))).toEqual(["vitals"])
    act(() => { view.pager.go("discharge") })
    expect(view.pager.active).toBe("discharge")
    expect(ALL.filter(key => view.pager.shown(key))).toEqual(["discharge"])
  })

  it("ignores a section it does not have, and one already open", () => {
    const view = mount(ALL, true)
    act(() => { view.pager.go("nowhere" as Keys) })
    act(() => { view.pager.go("vitals") })
    expect(view.pager.active).toBe("vitals")
  })

  it("a swipe left opens the next section, a swipe right the one before", () => {
    const view = mount(ALL, true)
    view.swipe({ dx: -260, dy: 4, vx: -1.2 })
    expect(view.pager.active).toBe("score")
    view.swipe({ dx: 260, dy: 4, vx: 1.2 })
    expect(view.pager.active).toBe("vitals")
  })

  it("goes no further than the first or the last, and ignores a mostly vertical drag", () => {
    const view = mount(ALL, true)
    view.swipe({ dx: 260, dy: 0, vx: 1.2 })
    expect(view.pager.active).toBe("vitals")
    view.swipe({ dx: -30, dy: 300, vx: 0 })
    expect(view.pager.active).toBe("vitals")
    act(() => { view.pager.go("discharge") })
    view.swipe({ dx: -260, dy: 0, vx: -1.2 })
    expect(view.pager.active).toBe("discharge")
  })

  it("gives way to the first section when the one open is switched off", () => {
    const view = mount(ALL, true)
    act(() => { view.pager.go("pain") })
    view.rerender(["vitals", "score", "discharge"])
    expect(view.pager.active).toBe("vitals")
    expect(view.pager.shown("pain")).toBe(false)
  })
})
