import { Pressable, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { colors, withAlpha } from "@/theme/colors"
import { OfflineLibraryBanner } from "@/components/OfflineLibraryBanner"
import { usePreferences } from "@/lib/preferences-context"

type Props = {
  eyebrow?: string
  title: string
  showNewCase?: boolean
  compact?: boolean
  onSearch?: () => void
  onBack?: () => void
}

const ICON_NAME: Record<string, keyof typeof Ionicons.glyphMap> = {
  home:     "home-outline",
  search:   "search-outline",
  settings: "settings-outline",
  new:      "add",
}

function HeaderButton({ kind, onPress, active = false, testID }: { kind: "home" | "new" | "settings" | "search"; onPress: () => void; active?: boolean; testID?: string }) {
  const { t } = usePreferences()
  const label = kind === "new" ? t("newCase") : kind === "home" ? t("dashboard") : kind === "search" ? t("searchPlaceholderShort") : t("settings")
  const iconColor = active ? colors.primary : colors.textSecondary
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 38,
        height: 38,
        flexShrink: 0,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? colors.primarySoft : colors.surfaceRaised,
        borderWidth: 1,
        borderColor: active ? withAlpha(colors.primary, "77") : colors.border,
      }}
    >
      <Ionicons name={ICON_NAME[kind]} size={kind === "new" ? 22 : 20} color={iconColor} />
    </Pressable>
  )
}

export function AppHeader({ eyebrow = "LOSPOR", title, showNewCase = true, compact = false, onSearch, onBack }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = usePreferences()

  return (
    <View style={{ paddingHorizontal: compact ? 16 : 20, paddingTop: insets.top + (compact ? 4 : 10), paddingBottom: compact ? 6 : 12, borderBottomWidth: 1, borderBottomColor: withAlpha(colors.border, "88"), backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.textSecondary, fontSize: compact ? 14 : 17, fontWeight: "900", letterSpacing: 0 }} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: compact ? 10 : 12, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View testID="app-header-actions" style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t("back")}
              style={{
                width: 38, height: 38, borderRadius: 999,
                alignItems: "center", justifyContent: "center",
                backgroundColor: colors.surfaceRaised,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <HeaderButton kind="home" testID="app-header-home" onPress={() => router.replace("/(app)")} />
          )}
          {onSearch ? <HeaderButton kind="search" onPress={onSearch} /> : null}
          {showNewCase ? <HeaderButton kind="new" active onPress={() => router.push("/(app)/cases/new")} /> : null}
          <HeaderButton kind="settings" testID="app-header-settings" onPress={() => router.push("/(app)/settings")} />
        </View>
      </View>
      {!compact ? <OfflineLibraryBanner /> : null}
    </View>
  )
}
