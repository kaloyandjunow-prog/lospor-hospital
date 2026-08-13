import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { TextInput } from "react-native"
import { getByText, pressByText, render } from "@/test/render"
import { PatientReferencePanel } from "./PatientReferencePanel"

describe("PatientReferencePanel", () => {
  it("shows only the masked reference until a deliberate correction", () => {
    const tree = render(
      <PatientReferencePanel
        reference={{ id: "link-1", maskedIdentifier: "HO•••11" }}
        language="en"
        onRelink={vi.fn()}
      />,
    )
    expect(getByText(tree, "HO•••11")).toBeTruthy()
    expect(JSON.stringify(tree.toJSON())).not.toContain("HOSP-RAW")
  })

  it("keeps correction unavailable for a finalised case", () => {
    const tree = render(
      <PatientReferencePanel
        reference={{ id: "link-1", maskedIdentifier: "HO•••11" }}
        language="en"
        allowCorrection={false}
        onRelink={vi.fn()}
      />,
    )
    expect(getByText(tree, "HO•••11")).toBeTruthy()
    expect(() => getByText(tree, "Correct patient link")).toThrow()
  })

  it("does not call the API callback unless both protected entries match", async () => {
    const onRelink = vi.fn(async () => {})
    const tree = render(
      <PatientReferencePanel
        reference={{ id: "link-1", maskedIdentifier: "HO•••11" }}
        language="en"
        onRelink={onRelink}
      />,
    )
    pressByText(tree, "Correct patient link")
    const inputs = tree.root.findAllByType(TextInput)
    expect(inputs).toHaveLength(2)
    expect(inputs.every(input => input.props.secureTextEntry === true)).toBe(true)
    act(() => {
      inputs[0].props.onChangeText("HOSP-NEW-1")
      inputs[1].props.onChangeText("HOSP-NEW-2")
    })
    pressByText(tree, "Confirm change")
    expect(onRelink).not.toHaveBeenCalled()
    expect(getByText(tree, "The two hospital patient numbers do not match.")).toBeTruthy()

    act(() => inputs[1].props.onChangeText("HOSP-NEW-1"))
    await act(async () => { pressByText(tree, "Confirm change") })
    expect(onRelink).toHaveBeenCalledOnce()
    expect(onRelink).toHaveBeenCalledWith("HOSP-NEW-1")
  })
})
