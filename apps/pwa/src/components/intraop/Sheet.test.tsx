import React from "react"
import { Text } from "react-native"
import { describe, expect, it } from "vitest"

import { render } from "@/test/render"
import { Sheet } from "./Sheet"

describe("Sheet fixed regions", () => {
  it("keeps the header and footer outside the scrollable body", () => {
    const tree = render(
      <Sheet
        visible
        onClose={() => {}}
        title="Drug"
        footer={<Text>Fixed add</Text>}
        full
      >
        <Text>Scrollable selector</Text>
      </Sheet>,
    )

    const header = tree.root.findByProps({ testID: "sheet-header" })
    const scroll = tree.root.findByProps({ testID: "sheet-scroll" })
    const footer = tree.root.findByProps({ testID: "sheet-footer" })

    expect(header.parent).toBe(scroll.parent)
    expect(footer.parent).toBe(scroll.parent)
    expect(scroll.findAllByProps({ testID: "sheet-footer" })).toHaveLength(0)
  })
})
