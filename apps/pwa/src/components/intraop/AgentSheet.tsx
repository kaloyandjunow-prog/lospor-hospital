import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"

type Agent = { name: string; color: string }

export function AgentSheet({
  visible, onClose, agents, agPick, setAgPick, activeAgent, onConfirm,
  quickPercents = {}, agPercent, setAgPercent, pediatricMode = false,
  prospectiveGuidanceEnabled = true,
}: {
  visible: boolean
  onClose: () => void
  agents: Agent[]
  agPick: Agent | null
  setAgPick: (a: Agent) => void
  activeAgent: Agent | null
  onConfirm: () => void
  quickPercents?: Record<string, number[]>
  agPercent?: number | null
  setAgPercent?: (p: number | null) => void
  pediatricMode?: boolean
  prospectiveGuidanceEnabled?: boolean
}) {
  const { tc, language } = usePreferences()
  const agentLabel = (name: string) => displayClinicalCode("option:INHALATIONAL_AGENT", name, language, { label: name })

  return (
    <Sheet visible={visible} onClose={onClose} title={tc("sasInhaledAgent")}>
      <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
        {agents.map(a => {
          const defaults = pediatricMode || !prospectiveGuidanceEnabled
            ? []
            : quickPercents[a.name] ?? [0.5, 1, 1.5, 2, 3]
          return (
            <TouchableOpacity key={a.name} onPress={() => { setAgPick(a); setAgPercent?.(defaults[0] ?? null) }}
              style={{ flex:1, paddingVertical:18, borderRadius:14, alignItems:"center",
                backgroundColor: agPick?.name===a.name ? a.color : a.color+"1a",
                borderWidth:2, borderColor:a.color }}>
              <Text style={{ color: agPick?.name===a.name ? "#fff" : a.color,
                fontWeight:"700", fontSize:14 }}>{agentLabel(a.name)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {agPick && (
        <>
          {pediatricMode ? (
            <Text style={{ color:"#fbbf24", fontSize:12, lineHeight:17, marginBottom:10 }}>
              {tc("pediatricAgentManual")}
            </Text>
          ) : null}
          <Text style={{ color: agPick.color, fontSize:12, fontWeight:"600", marginBottom:10 }}>
            {`Fi${agentLabel(agPick.name)}`}
          </Text>
          <DoseSelector
            color={agPick.color}
            quickValues={pediatricMode || !prospectiveGuidanceEnabled
              ? undefined
              : quickPercents[agPick.name] ?? [0.5, 1, 1.5, 2, 3]}
            manualEntryOnly={pediatricMode || !prospectiveGuidanceEnabled}
            value={agPercent != null ? String(agPercent) : ""}
            onValueChange={v => setAgPercent?.(v.trim() ? parseFloat(v) || 0 : null)}
            min={0} max={10} step={0.1} precision={1}
            valuePlaceholder="Fi%" unitSuffix="%"
            confirmLabel={formatMessage(
              tc(activeAgent && activeAgent.name !== agPick.name ? "switchToAgent" : "startAgent"),
              { name: agentLabel(agPick.name) },
            )}
            onConfirm={onConfirm}
            confirmDisabled={(pediatricMode || !prospectiveGuidanceEnabled) && agPercent == null}
          />
        </>
      )}
    </Sheet>
  )
}
