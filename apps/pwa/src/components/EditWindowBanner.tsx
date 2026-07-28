import { useEffect, useState } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import { INTRAOP_RESUME_WINDOW_MS } from "@lospor/core/intraop-engine"

function useEditWindowCountdown(finalizedAt: string | null | undefined) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!finalizedAt) { setSecsLeft(null); return }
    const deadline = new Date(finalizedAt).getTime() + INTRAOP_RESUME_WINDOW_MS
    const calc = () => {
      const diff = Math.round((deadline - Date.now()) / 1000)
      setSecsLeft(diff > 0 ? diff : null)
    }
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [finalizedAt])

  return secsLeft
}

type Props = {
  finalizedAt: string | null | undefined
  caseId?: string
  showBackButton?: boolean
}

export function EditWindowBanner({ finalizedAt, caseId, showBackButton }: Props) {
  const secsLeft = useEditWindowCountdown(finalizedAt)
  const router = useRouter()
  const { t } = usePreferences()

  if (secsLeft == null) return null

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0")
  const ss = String(secsLeft % 60).padStart(2, "0")

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingVertical: 9,
      backgroundColor: withAlpha(colors.warning, "14"),
      borderBottomWidth: 1, borderBottomColor: withAlpha(colors.warning, "44"),
    }}>
      <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "700" }}>
        ⏱ {t("editWindowClosesIn")} {mm}:{ss}
      </Text>
      {showBackButton && caseId && (
        <TouchableOpacity
          onPress={() => router.replace(`/(app)/cases/${caseId}`)}
          style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
            backgroundColor: withAlpha(colors.warning, "18"),
            borderWidth: 1, borderColor: withAlpha(colors.warning, "55"),
          }}
        >
          <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "700" }}>{t("summaryBack")}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
