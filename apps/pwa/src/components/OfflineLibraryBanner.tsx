import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { useAnyLibraryFallback } from "@/lib/use-option-library"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"

// Shown whenever any option-library category is currently serving
// cached/bundled data instead of a live server fetch — so a clinician never
// silently trusts a picker list without knowing it might be out of date.
// Disappears automatically the moment the background retry in
// useOptionLibrary succeeds. See docs/post-migration-seeds.md and
// scripts/generate-option-library-fallback.ts for how the bundled tier
// is produced and kept in sync.
export function OfflineLibraryBanner() {
  const { active, snapshotDate } = useAnyLibraryFallback()
  const { language, t } = usePreferences()
  if (!active) return null

  const dateStr = snapshotDate !== "unknown"
    ? new Date(snapshotDate).toLocaleDateString(language === "bg" ? "bg-BG" : "en-GB")
    : null

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: withAlpha(colors.warning, "22"),
      borderBottomWidth: 1, borderBottomColor: withAlpha(colors.warning, "55"),
      paddingHorizontal: 12, paddingVertical: 6,
    }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.warning }}>⚠</Text>
      <Text style={{ fontSize: 11, color: colors.textPrimary, flex: 1 }} numberOfLines={2}>
        {t("libraryOfflineBanner")}
        {dateStr ? ` (${formatMessage(t("libraryOfflineAsOf"), { date: dateStr })})` : ""}
      </Text>
    </View>
  )
}
