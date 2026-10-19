import { View } from "react-native"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel } from "@/lib/case-detail-summary"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { ScoreBadge } from "./ScoreBadge"

type Score = "RCRI" | "APFEL" | "STOPBANG"

/** RCRI, Apfel and STOP-BANG side by side on the adult form; a score whose inputs are switched off says so. */
export function AdultScoreBadges({ rcriScore, apfelScore, stopBangScore, available, language, tc }: {
  rcriScore: number
  apfelScore: number
  stopBangScore: number
  available: (score: Score) => boolean
  language: string
  tc: (key: ClinicalStringKey) => string
}) {
  const unavailable = (score: Score) => available(score) ? undefined : tc("preopScoreUnavailable")
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
      <ScoreBadge label="RCRI" score={rcriScore} max={6} riskLabel={rcriRiskLabel(rcriScore, language)} unavailable={unavailable("RCRI")} />
      <ScoreBadge label="Apfel" score={apfelScore} max={4} riskLabel={apfelRiskLabel(apfelScore, language)} unavailable={unavailable("APFEL")} />
      <ScoreBadge label="STOP-BANG" score={stopBangScore} max={8} riskLabel={stopBangRiskLabel(stopBangScore, language)} unavailable={unavailable("STOPBANG")} />
    </View>
  )
}
