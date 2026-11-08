import { Pressable, Text, View } from "react-native"
import { colors } from "@/theme/colors"
import { hapticTick } from "@/lib/haptic"
import { useOptionLibrary } from "@/lib/use-option-library"
import { displayOption } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { metadataString } from "@lospor/core/option-contracts"

export function BloodGrid({ bloodType, rhFactor, onChange }: {
  bloodType?: "A" | "B" | "AB" | "O"
  rhFactor?: "POSITIVE" | "NEGATIVE"
  onChange: (bloodType: "A" | "B" | "AB" | "O" | undefined, rhFactor: "POSITIVE" | "NEGATIVE" | undefined) => void
}) {
  const { language } = usePreferences()
  const { options: bloodGroupOptions } = useOptionLibrary("BLOOD_GROUP")
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {bloodGroupOptions.map(opt => {
        const bloodTypeValue = metadataString(opt.metadata, "bloodType")
        const rhFactorValue = metadataString(opt.metadata, "rhFactor")
        const optionBloodType =
          bloodTypeValue === "A"
          || bloodTypeValue === "B"
          || bloodTypeValue === "AB"
          || bloodTypeValue === "O"
            ? bloodTypeValue
            : undefined
        const optionRhFactor =
          rhFactorValue === "POSITIVE" || rhFactorValue === "NEGATIVE"
            ? rhFactorValue
            : undefined
        const selected =
          bloodType === optionBloodType
          && rhFactor === optionRhFactor
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              hapticTick()
              onChange(
                selected ? undefined : optionBloodType,
                selected ? undefined : optionRhFactor,
              )
            }}
            style={{
              width: "23%",
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
            }}
          >
            <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 15, fontWeight: "900" }}>{displayOption("BLOOD_GROUP", opt, language)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
