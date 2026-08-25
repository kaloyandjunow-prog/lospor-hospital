import React from "react"
import { useForm } from "react-hook-form"
import type { ReactTestInstance } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { getByText, pressByText, render } from "@/test/render"
import { AuthProvider } from "@/lib/auth-context"
import type { PediatricModeCapability } from "@/lib/deployment-capabilities"
import { PreferencesProvider } from "@/lib/preferences-context"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import {
  PEDIATRIC_PREOP_LABELS,
  PediatricModeAgeFields,
} from "./PediatricPreopSections"

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }))
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))

const enabledCapability: PediatricModeCapability = {
  enabled: true,
  reason: "ENABLED",
  productionReady: true,
  rulesetVersion: "2026.08.04-release.1",
  minimumClientVersion: "8.0.0",
  reviewedDoseProfilesRequired: true,
}

const disabledCapability: PediatricModeCapability = {
  ...enabledCapability,
  enabled: false,
  reason: "DISABLED_BY_DEPLOYMENT",
}

function pressableForText(root: ReactTestInstance, text: string): ReactTestInstance {
  let node: ReactTestInstance | null = root.find(item => item.children.includes(text))
  while (node && typeof node.props.onPress !== "function") node = node.parent
  if (!node) throw new Error(`No Pressable found for ${text}`)
  return node
}

function FormHarness({
  capability,
  mode = "ADULT",
  language = "en",
  existingPediatricRecord = false,
}: {
  capability: PediatricModeCapability
  mode?: "ADULT" | "PEDIATRIC"
  language?: "en" | "bg"
  existingPediatricRecord?: boolean
}) {
  const { control, setValue } = useForm<PreopFormInput>({
    defaultValues: {
      clinicalMode: mode,
      ...(mode === "PEDIATRIC" ? { ageValue: 8, ageUnit: "YEARS", ageYears: 8 } : {}),
    },
  })
  return (
    <PediatricModeAgeFields
      control={control}
      setValue={setValue}
      tc={key => key}
      language={language}
      pediatricModeCapability={capability}
      existingPediatricRecord={existingPediatricRecord}
    />
  )
}

function Harness(props: React.ComponentProps<typeof FormHarness>) {
  return (
    <AuthProvider>
      <PreferencesProvider initialLanguage={props.language ?? "en"}>
        <FormHarness {...props} />
      </PreferencesProvider>
    </AuthProvider>
  )
}

describe("PediatricModeAgeFields capability boundary", () => {
  it("disables a new Pediatric selection when the deployment capability is off", () => {
    const tree = render(<Harness capability={disabledCapability} />)
    const labels = PEDIATRIC_PREOP_LABELS.en
    const pediatric = pressableForText(tree.root, labels.pediatric)

    expect(getByText(tree, labels.pediatricUnavailableNew)).toBeTruthy()
    expect(pediatric.props.disabled).toBe(true)
    expect(pediatric.props.accessibilityState).toEqual({ disabled: true, selected: false })

    pressByText(tree, labels.pediatric)
    expect(pressableForText(tree.root, labels.pediatric).props.accessibilityState.selected).toBe(false)
  })

  it("reveals Pediatric entry only after the exact capability is enabled", () => {
    const tree = render(<Harness capability={enabledCapability} />)
    const labels = PEDIATRIC_PREOP_LABELS.en

    pressByText(tree, labels.pediatric)

    expect(pressableForText(tree.root, labels.pediatric).props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    })
    expect(getByText(tree, labels.preciseAge)).toBeTruthy()
  })

  it("keeps an existing Pediatric record visible and explains the disabled state in Bulgarian", () => {
    const tree = render(
      <Harness
        capability={disabledCapability}
        mode="PEDIATRIC"
        language="bg"
        existingPediatricRecord
      />,
    )
    const labels = PEDIATRIC_PREOP_LABELS.bg
    const adult = pressableForText(tree.root, labels.adult)
    const pediatric = pressableForText(tree.root, labels.pediatric)

    expect(getByText(tree, labels.pediatricUnavailableExisting)).toBeTruthy()
    expect(getByText(tree, labels.preciseAge)).toBeTruthy()
    expect(adult.props.disabled).toBe(true)
    expect(pediatric.props.accessibilityState).toEqual({ disabled: true, selected: true })
  })
})
