import { useMemo, useState } from "react"
import { Text, View } from "react-native"
import { Sheet } from "./Sheet"
import { FeedbackPressable } from "./FeedbackPressable"
import { LabScanPanel } from "@/components/LabScanPanel"
import { ManualLabPanel } from "@/components/preop/ManualLabPanel"
import { usePreferences } from "@/lib/preferences-context"
import { abnormalSummary, groupLabsByDraw, type LabResult } from "@/lib/labs"

/**
 * Laboratory results drawn during the case.
 *
 * Preoperative labs are one snapshot. During a case there are several -- a gas
 * at induction, another after the blood, a haemoglobin an hour later -- so this
 * edits one *draw* at a time, stamped with the slot the clinician tapped. That
 * is what makes two haemoglobins an hour apart a trend rather than one value
 * that appears to have been corrected.
 *
 * The three ways a result can arrive are the same three the preoperative screen
 * offers, and deliberately the same components: typed by hand, read off a
 * photographed report by AI, or proposed by the hospital system. Each carries
 * its own provenance, so "the ward record says" stays distinguishable from
 * "the anaesthetist typed".
 */
type Props = {
  visible: boolean
  /** The draw being edited, as an ISO instant. Every row here shares it. */
  takenAt: string
  /** Every intraoperative result on the case, across all draws. */
  value: LabResult[]
  title: string
  onClose: () => void
  onChange: (next: LabResult[]) => void
  onEnsureCase: () => Promise<string | null>
  /** Rendered under the manual entry when the deployment has an EHR feed. */
  importPanel?: React.ReactNode
}

export function LabsSheet({
  visible, takenAt, value, title, onClose, onChange, onEnsureCase, importPanel,
}: Props) {
  const { tc } = usePreferences()
  const [showScan, setShowScan] = useState(false)

  // This draw's rows, and everything else untouched. Splitting them is what
  // lets the manual panel keep its one-row-per-test rule: within a single draw
  // a test appears once, while across draws it appears as often as it was sent.
  const thisDraw = useMemo(
    () => value.filter(row => row.takenAt === takenAt),
    [value, takenAt],
  )
  const otherDraws = useMemo(
    () => value.filter(row => row.takenAt !== takenAt),
    [value, takenAt],
  )

  // Earlier draws, newest first, so a falling trend is visible while entering
  // the next one. Read-only here: this sheet edits the draw it was opened at.
  const priorDraws = useMemo(
    () => groupLabsByDraw(otherDraws).slice(0, 3),
    [otherDraws],
  )

  // The same three-result summary the web timetable lane shows, from the same
  // Core helper. It sits at the top rather than the bottom because it is the
  // reason to open this sheet at all when results already exist, and because
  // a phone screen loses anything below the fold.
  const summary = useMemo(() => abnormalSummary(value), [value])

  function replaceThisDraw(rows: LabResult[]) {
    onChange([...otherDraws, ...rows.map(row => ({ ...row, takenAt }))])
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      <View style={{ gap: 14 }}>
        {summary.shown.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: "#64748b", fontSize: 11, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" }}>
              {tc("labsLatestDraw")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {summary.shown.map(item => {
                const tone = item.severity === "critical"
                  ? { bg: "#dc262633", fg: "#fca5a5", border: "#dc2626" }
                  : item.severity === "normal"
                    ? { bg: "#111827", fg: "#94a3b8", border: "#1f2937" }
                    : { bg: "#78350f44", fg: "#fcd34d", border: "#d97706" }
                return (
                  <View
                    key={`${item.result.test}-${item.result.takenAt ?? ""}`}
                    style={{
                      backgroundColor: tone.bg, borderColor: tone.border, borderWidth: 1,
                      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: tone.fg, fontSize: 11, fontWeight: item.severity === "critical" ? "900" : "700" }}>
                      {item.result.test} {item.result.value}{item.result.unit ? ` ${item.result.unit}` : ""}
                    </Text>
                  </View>
                )
              })}
              {summary.hiddenCount > 0 ? (
                <Text style={{ color: "#64748b", fontSize: 11, fontWeight: "700", alignSelf: "center" }}>
                  +{summary.hiddenCount}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Scanning is opt-in per draw rather than always mounted: it is the
            one control here that sends a photograph off the device, and it
            should be a deliberate act, not something sitting under a thumb. */}
        {showScan ? (
          <LabScanPanel
            value={thisDraw}
            takenAt={takenAt}
            onAddResults={results => replaceThisDraw([...thisDraw, ...results])}
            onEnsureCase={onEnsureCase}
          />
        ) : (
          <FeedbackPressable
            onPress={() => setShowScan(true)}
            style={{
              borderRadius: 12, borderWidth: 1, borderColor: "#334155",
              backgroundColor: "#111827", paddingVertical: 12, alignItems: "center",
            }}
          >
            <Text style={{ color: "#93c5fd", fontWeight: "800", fontSize: 13 }}>
              {tc("lspScanLabReport")}
            </Text>
          </FeedbackPressable>
        )}

        {importPanel}

        <ManualLabPanel
          value={thisDraw}
          onChange={replaceThisDraw}
          labelManualLabEntry={tc("manualLabEntry")}
          labelHideManualLab={tc("hideManualLab")}
          labelSearchLabs={tc("searchLabs")}
        />

        {priorDraws.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: "#64748b", fontSize: 11, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" }}>
              {tc("ehrEarlierResults")}
            </Text>
            {priorDraws.map(draw => (
              <View
                key={draw.takenAt ?? "undated"}
                style={{ backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1f2937", padding: 10, gap: 4 }}
              >
                <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "800" }}>
                  {draw.takenAt ? new Date(draw.takenAt).toISOString().substring(11, 16) : tc("ehrUndated")}
                </Text>
                <Text style={{ color: "#cbd5e1", fontSize: 12 }} numberOfLines={2}>
                  {draw.results.map(r => `${r.test} ${r.value}${r.unit ? ` ${r.unit}` : ""}`).join(" · ")}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}
