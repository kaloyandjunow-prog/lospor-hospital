import { Text } from "react-native"
import { FeedbackPressable } from "./FeedbackPressable"
import { usePreferences } from "@/lib/preferences-context"
import { capabilityMessageKey, useClinicalAiCapabilities } from "@/lib/deployment-capabilities"
import { useShade } from "@/theme/shade"

/** "Scan monitor" at the top of the vitals sheet, or why it is not available. */
export function MonitorScanButton({ onScan, busy }: { onScan: () => void; busy: boolean }) {
  const shade = useShade()
  const { tc } = usePreferences()
  const clinicalAi = useClinicalAiCapabilities()
  if (!clinicalAi.monitorOcr.enabled) {
    return (
      <Text style={{ color:shade("#64748b"), fontSize:11, marginBottom:14, lineHeight:16 }}>
        {tc(capabilityMessageKey(clinicalAi.monitorOcr.reason))}
      </Text>
    )
  }
  return (
    <>
      <FeedbackPressable
        onPress={onScan}
        disabled={busy}
        style={{ flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8,
          paddingVertical:10, paddingHorizontal:16, borderRadius:12, marginBottom:16,
          backgroundColor: busy ? shade("#1e2d40") : shade("#0f2a1a"),
          borderWidth:1, borderColor: busy ? shade("#2a3a50") : shade("#22c55e55") }}>
        <Text style={{ color: busy ? shade("#64748b") : shade("#86efac"), fontSize:13, fontWeight:"700" }}>
          {busy ? tc("vsReadingMonitor") : tc("vsScanMonitor")}
        </Text>
      </FeedbackPressable>
      {!busy ? (
        <Text style={{ color:shade("#475569"), fontSize:10, marginBottom:14, lineHeight:14 }}>
          {tc("vsScanPrivacyNote")}
        </Text>
      ) : null}
    </>
  )
}
