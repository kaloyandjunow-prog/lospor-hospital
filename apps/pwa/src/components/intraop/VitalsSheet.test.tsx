import { createRef, type ComponentProps } from "react"
import { type TextInputInstance } from "react-native"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "externalAiDisabledDeployment",
  useClinicalAiCapabilities: () => ({
    monitorOcr: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
  }),
}))

import { getByText, pressByText } from "@/test/render"
import { renderWithPreferences } from "./fluid-sheet-test-fixtures"
import { VitalsSheet } from "./VitalsSheet"

const inputRef = () => createRef<TextInputInstance>()

function props(): ComponentProps<typeof VitalsSheet> {
  return {
    visible: true,
    title: "Vitals",
    mode: "full",
    scanBusy: false,
    showEtco2: true,
    showTemperature: true,
    showBis: true,
    showTofRatio: true,
    showCvp: true,
    showIbp: false,
    etco2Unit: "mmHg",
    temperatureUnit: "C",
    cvpUnit: "mmHg",
    sysRef: inputRef(),
    diaRef: inputRef(),
    hrRef: inputRef(),
    spo2Ref: inputRef(),
    etco2Ref: inputRef(),
    tempRef: inputRef(),
    bisRef: inputRef(),
    tofRatioRef: inputRef(),
    cvpRef: inputRef(),
    systolic: "",
    diastolic: "",
    heartRate: "",
    spo2: "",
    etco2: "",
    temperature: "",
    bis: "",
    tofRatio: "",
    cvp: "",
    ibp: { ibpSystolic: "", ibpDiastolic: "", ibpMap: "", nibpMap: "" },
    onIbpChange: vi.fn(),
    feedback: { errors: {}, warnings: {}, hasHardErrors: false },
    onClose: vi.fn(),
    onScan: vi.fn(),
    onSystolicChange: vi.fn(),
    onDiastolicChange: vi.fn(),
    onHeartRateChange: vi.fn(),
    onSpo2Change: vi.fn(),
    onEtco2Change: vi.fn(),
    onTemperatureChange: vi.fn(),
    onBisChange: vi.fn(),
    onTofRatioChange: vi.fn(),
    onCvpChange: vi.fn(),
    onConfirm: vi.fn(),
  }
}

describe("VitalsSheet validation feedback", () => {
  it("shows a device-scale error and disables Save", () => {
    const sheetProps = props()
    sheetProps.bis = "101"
    sheetProps.feedback = { errors: { bis: "above_max" }, warnings: {}, hasHardErrors: true }
    const tree = renderWithPreferences(<VitalsSheet {...sheetProps} />)

    expect(getByText(tree, "BIS must be a whole number from 0 to 100.")).toBeTruthy()
    expect(getByText(tree, "TOF ratio 0–1")).toBeTruthy()
    pressByText(tree, "Save vitals")
    expect(sheetProps.onConfirm).not.toHaveBeenCalled()
  })

  it("shows an amber plausibility warning without disabling Save", () => {
    const sheetProps = props()
    sheetProps.systolic = "301"
    sheetProps.feedback = { errors: {}, warnings: { systolic: "high" }, hasHardErrors: false }
    const tree = renderWithPreferences(<VitalsSheet {...sheetProps} />)

    expect(getByText(tree, "Unusually high systolic pressure (>300 mmHg). Verify the reading.")).toBeTruthy()
    pressByText(tree, "Save vitals")
    expect(sheetProps.onConfirm).toHaveBeenCalledOnce()
  })

  it("names low SpO2 and EtCO2 rather than borrowing the temperature warning", () => {
    const sheetProps = props()
    sheetProps.spo2 = "75"
    sheetProps.etco2 = "20"
    sheetProps.feedback = { errors: {}, warnings: { spO2: "low", etco2: "low" }, hasHardErrors: false }
    const tree = renderWithPreferences(<VitalsSheet {...sheetProps} />)

    expect(getByText(tree, "Low SpO₂ (<80 %). Verify the reading.")).toBeTruthy()
    expect(getByText(tree, "Low EtCO₂ (<25 mmHg / 3.3 kPa). Verify the reading.")).toBeTruthy()
  })

  it("reveals a hidden hard-invalid field in BP mode so Save explains why it is blocked", () => {
    const sheetProps = props()
    sheetProps.mode = "bp"
    sheetProps.showEtco2 = false
    sheetProps.etco2 = "-1"
    sheetProps.feedback = { errors: { etco2: "below_min" }, warnings: {}, hasHardErrors: true }
    const tree = renderWithPreferences(<VitalsSheet {...sheetProps} />)

    expect(getByText(tree, "Enter a number of 0 or greater.")).toBeTruthy()
    expect(getByText(tree, "EtCO₂")).toBeTruthy()
    pressByText(tree, "Save vitals")
    expect(sheetProps.onConfirm).not.toHaveBeenCalled()
  })

  it("reveals an invalid monitor field even when that monitor is not selected", () => {
    const sheetProps = props()
    sheetProps.showBis = false
    sheetProps.bis = "101"
    sheetProps.feedback = { errors: { bis: "above_max" }, warnings: {}, hasHardErrors: true }
    const tree = renderWithPreferences(<VitalsSheet {...sheetProps} />)

    expect(getByText(tree, "BIS must be a whole number from 0 to 100.")).toBeTruthy()
  })
})

describe("VitalsSheet arterial line (10.2.0)", () => {
  const byId = (tree: ReturnType<typeof renderWithPreferences>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]

  it("shows the IBP block only when the invasive pressure monitor is on, and labels the cuff NIBP", () => {
    const off = renderWithPreferences(<VitalsSheet {...props()} />)
    expect(byId(off, "vitals-ibp")).toBeUndefined()
    expect(byId(off, "vitals-nibp-map")).toBeTruthy()
    expect(byId(off, "vitals-nibp-map")!.props.placeholder).toBe("(MAP)")
    const sheetProps = props()
    sheetProps.showIbp = true
    const on = renderWithPreferences(<VitalsSheet {...sheetProps} />)
    expect(byId(on, "vitals-ibp")).toBeTruthy()
    expect(getByText(on, "NIBP (cuff)")).toBeTruthy()
    expect(getByText(on, "IBP (arterial line)")).toBeTruthy()
  })

  it("sends each arterial line field to the one change handler", () => {
    const sheetProps = props()
    sheetProps.showIbp = true
    const tree = renderWithPreferences(<VitalsSheet {...sheetProps} />)
    byId(tree, "vitals-ibp-systolic")!.props.onChangeText("124")
    byId(tree, "vitals-ibp-map")!.props.onChangeText("86")
    byId(tree, "vitals-nibp-map")!.props.onChangeText("87")
    expect(sheetProps.onIbpChange).toHaveBeenCalledWith("ibpSystolic", "124")
    expect(sheetProps.onIbpChange).toHaveBeenCalledWith("ibpMap", "86")
    expect(sheetProps.onIbpChange).toHaveBeenCalledWith("nibpMap", "87")
  })
})
