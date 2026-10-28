import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it } from "vitest"
import type { PremedicationOrders } from "@lospor/core/premedication"
import { render } from "@/test/render"
import { useIntraopPremedicationPrefill } from "./use-intraop-premedication-prefill"

// The intraop premedication on the phone starts from the preop order (1.7.0),
// never before the case has loaded and never on a finalised case.

type Props = { ready: boolean; readOnly: boolean; ordered: PremedicationOrders | null }
type Texts = { evening: string; morning: string }

function mount(initial: Props, texts: Texts) {
  const fills: Array<Partial<Texts>> = []
  function Harness(props: Props) {
    useIntraopPremedicationPrefill({ ...props, current: texts, fill: next => { fills.push(next); Object.assign(texts, next) } })
    return null
  }
  const tree = render(<Harness {...initial} />)
  return { fills, texts, update: (next: Props) => act(() => { tree.update(<Harness {...next} />) }) }
}

const ORDER = { DAY_BEFORE: "Midazolam 7.5 mg PO", MORNING: "Pantoprazole 40 mg PO" }

describe("the phone's intraop premedication and the preop order", () => {
  it("waits for the case to load, then fills both phases in one save", () => {
    const view = mount({ ready: false, readOnly: false, ordered: ORDER }, { evening: "", morning: "" })
    expect(view.fills).toEqual([])
    view.update({ ready: true, readOnly: false, ordered: ORDER })
    expect(view.fills).toEqual([{ evening: "Midazolam 7.5 mg PO", morning: "Pantoprazole 40 mg PO" }])
  })

  it("leaves a phase someone filled or marked N/A", () => {
    const view = mount({ ready: true, readOnly: false, ordered: ORDER }, { evening: "N/A", morning: "Diazepam 5 mg PO" })
    expect(view.fills).toEqual([])
  })

  it("writes nothing to a finalised case", () => {
    expect(mount({ ready: true, readOnly: true, ordered: ORDER }, { evening: "", morning: "" }).fills).toEqual([])
  })

  it("waits while another device holds the case, and fills on take-over", () => {
    // Watching mode saves nothing: an order applied then would show on screen
    // and never reach the server.
    const view = mount({ ready: true, readOnly: true, ordered: ORDER }, { evening: "", morning: "" })
    expect(view.fills).toEqual([])
    view.update({ ready: true, readOnly: false, ordered: ORDER })
    expect(view.fills).toEqual([{ evening: "Midazolam 7.5 mg PO", morning: "Pantoprazole 40 mg PO" }])
  })

  it("does not refill a phase emptied on purpose, unless the order changes", () => {
    const view = mount({ ready: true, readOnly: false, ordered: ORDER }, { evening: "", morning: "" })
    view.texts.evening = ""
    view.update({ ready: true, readOnly: false, ordered: { ...ORDER } })
    expect(view.fills).toHaveLength(1)
    view.update({ ready: true, readOnly: false, ordered: { ...ORDER, DAY_BEFORE: "Midazolam 3.75 mg PO" } })
    expect(view.fills[1]).toEqual({ evening: "Midazolam 3.75 mg PO" })
  })
})
