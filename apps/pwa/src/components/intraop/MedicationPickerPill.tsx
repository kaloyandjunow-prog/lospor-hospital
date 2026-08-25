import { Text, TouchableOpacity } from "react-native"

export function MedicationPickerPill({
  label,
  sublabel,
  color,
  selected,
  onPress,
  wide,
}: {
  label: string
  sublabel?: string
  color: string
  selected?: boolean
  onPress: () => void
  wide?: boolean
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        width: wide ? "100%" : "47.5%",
        minHeight: 58,
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: selected ? color : color + "1a",
        borderWidth: 1,
        borderColor: selected ? color : color + "66",
      }}
    >
      <Text style={{ color: selected ? "#fff" : color, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={{ color: selected ? "#e2e8f0" : "#94a3b8", fontSize: 10, marginTop: 2 }} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}
