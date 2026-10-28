import { Animated, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native"
import type { RefObject } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import { colors, withAlpha } from "@/theme/colors"
import type { PreopSection } from "@/lib/preop-form-schema"

export function PreopSectionRail({ labels, activeSection, sectionRailRef, headerAnim, primaryHeaderHeight, insetTop, homeLabel, onHome, onJump, onPillLayout }: {
  labels: { key: PreopSection; label: string }[]
  activeSection: PreopSection
  sectionRailRef: RefObject<ScrollView | null>
  headerAnim: Animated.Value
  primaryHeaderHeight: number
  insetTop: number
  homeLabel: string
  onHome: () => void
  onJump: (section: PreopSection) => void
  onPillLayout: (section: PreopSection, event: LayoutChangeEvent) => void
}) {
  return <>
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, height: primaryHeaderHeight, overflow: "hidden", backgroundColor: colors.background, opacity: headerAnim.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 0.2, 0] }), transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -primaryHeaderHeight] }) }] }} />
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 29, backgroundColor: colors.background, paddingTop: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, insetTop + 10] }), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [primaryHeaderHeight, 0] }) }] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={onHome}
          accessibilityRole="button"
          accessibilityLabel={homeLabel}
          style={{
            marginLeft: 20,
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceRaised,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="home-outline" size={20} color={colors.textSecondary} />
        </Pressable>
        <ScrollView ref={sectionRailRef} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingRight: 20, gap: 10 }}>
        {labels.map(section => {
          const isActive = activeSection === section.key
          return <View key={section.key} style={{ alignItems: "center" }} onLayout={event => onPillLayout(section.key, event)}>
            <Pressable onPress={() => onJump(section.key)} style={{ minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: isActive ? withAlpha(colors.primary, "AA") : colors.border, backgroundColor: isActive ? colors.primarySoft : colors.surfaceRaised, paddingHorizontal: 17, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: isActive ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{section.label}</Text>
            </Pressable>
            {isActive && <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.primary, width: "80%", marginTop: 3 }} />}
          </View>
        })}
        </ScrollView>
      </View>
    </Animated.View>
  </>
}
