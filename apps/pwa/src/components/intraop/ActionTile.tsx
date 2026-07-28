import { View, Text, TouchableOpacity } from "react-native"

export function ActionTile({
  label, sub, color, onPress, flex = 1, compact = false, outline = false,
}: {
  label: string
  sub?: string
  color: string
  onPress: () => void
  flex?: number
  compact?: boolean
  outline?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        flex,
        minHeight: compact ? 52 : 70,
        borderRadius: compact ? 14 : 18,
        borderCurve: "continuous",
        paddingVertical: compact ? 11 : 14,
        paddingHorizontal: compact ? 10 : 12,
        justifyContent: "center",
        backgroundColor: outline ? "#151515" : color + "24",
        borderWidth: 1,
        borderColor: color + "88",
        boxShadow: outline ? "0 0 0 rgba(0,0,0,0)" : `0 10px 24px ${color}22`,
      }}
    >
      <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
        <View style={{
          width: compact ? 5 : 7,
          height: compact ? 30 : 38,
          borderRadius: 999,
          backgroundColor: color,
        }} />
        <View style={{ flex:1 }}>
          <Text style={{ color:"#f8fafc", fontWeight:"800", fontSize:compact ? 13 : 16 }} numberOfLines={1}>
            {label}
          </Text>
          {!!sub && (
            <Text style={{ color:color, fontSize:compact ? 10 : 11, fontWeight:"700", marginTop:2 }} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}
