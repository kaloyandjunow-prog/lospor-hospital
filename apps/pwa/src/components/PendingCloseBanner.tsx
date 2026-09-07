import { useEffect, useRef, useState } from "react"
import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import { pendingCloseState } from "@lospor/core/case-close-window"

/**
 * Counts down the same server-anchored window the web app shows on both its
 * creation wizard and its case-detail page: `awaitingReviewAt` is set once,
 * server-side, the moment a case first reaches AWAITING_REVIEW, so every
 * client reads the same remaining time for the same case. Calls `onExpire`
 * exactly once when the window closes.
 */
function usePendingCloseCountdown(
  awaitingReviewAt: string | null | undefined,
  onExpire: () => void,
) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire })

  useEffect(() => {
    const tick = () => {
      if (!awaitingReviewAt) { setSecsLeft(null); return false }
      const state = pendingCloseState({ awaitingReviewAt, finalizedAt: null }, new Date())
      if (state.kind === "counting-down") {
        setSecsLeft(Math.ceil(state.remainingMs / 1000))
        return true
      }
      if (state.kind === "expired") {
        setSecsLeft(0)
        onExpireRef.current()
        return false
      }
      setSecsLeft(null)
      return false
    }
    if (!tick()) return
    const id = setInterval(() => { if (!tick()) clearInterval(id) }, 1000)
    return () => clearInterval(id)
  }, [awaitingReviewAt])

  return secsLeft
}

type Props = {
  awaitingReviewAt: string | null | undefined
  onExpire: () => void
}

export function PendingCloseBanner({ awaitingReviewAt, onExpire }: Props) {
  const secsLeft = usePendingCloseCountdown(awaitingReviewAt, onExpire)
  const { t } = usePreferences()

  if (secsLeft == null) return null

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0")
  const ss = String(secsLeft % 60).padStart(2, "0")

  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 9,
      backgroundColor: withAlpha(colors.warning, "14"),
      borderBottomWidth: 1, borderBottomColor: withAlpha(colors.warning, "44"),
    }}>
      <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "700" }}>
        ⏱ {t("pendingCloseIn")} {mm}:{ss}
      </Text>
      <Text style={{ color: withAlpha(colors.warning, "cc"), fontSize: 11, marginTop: 2 }}>
        {t("pendingCloseHint")}
      </Text>
    </View>
  )
}
