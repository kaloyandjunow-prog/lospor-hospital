import { createRef, type ComponentProps } from "react"
import { TextInput } from "react-native"
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

const inputRef = () => createRef<TextInput>()

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
