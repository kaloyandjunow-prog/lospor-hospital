import React from "react"
import { describe, expect, it } from "vitest"
import { getByText, render } from "@/test/render"
import { MaskedPatientReference } from "./MaskedPatientReference"

describe("MaskedPatientReference", () => {
  it("shows the safe patient marker on ordinary case views", () => {
    const tree = render(
      <MaskedPatientReference
        reference={{ id: "link-1", maskedIdentifier: "HO•••91" }}
        language="en"
      />,
    )
    expect(getByText(tree, "Patient")).toBeTruthy()
    expect(JSON.stringify(tree.toJSON())).toContain("HO•••91")
    expect(JSON.stringify(tree.toJSON())).not.toContain("HOSP-RAW")
  })

  it("renders no guessed identity when the API provides no reference", () => {
    expect(render(<MaskedPatientReference reference={null} language="en" />).toJSON()).toBeNull()
  })
})
