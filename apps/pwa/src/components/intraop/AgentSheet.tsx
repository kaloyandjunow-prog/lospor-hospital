import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type Agent = { name: string; color: string }

export function AgentSheet({
  visible, onClose, agents, agPick, setAgPick, activeAgent, onConfirm,
  quickPercents = {}, agPercent, setAgPercent,
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
  setAgPercent?: (p: number) => void
}) {
  const { tc, language } = usePreferences()
  const agentLabel = (name: string) => displayClinicalCode("option:INHALATIONAL_AGENT", name, language, { label: name })

  return (
    <Sheet visible={visible} onClose={onClose} title={tc("sasInhaledAgent")}>
      <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
        {agents.map(a => {
          const defaults = quickPercents[a.name] ?? [0.5, 1, 1.5, 2, 3]
          return (
            <TouchableOpacity key={a.name} onPress={() => { setAgPick(a); setAgPercent?.(defaults[0]) }}
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
        <DoseSelector
          color={agPick.color}
          hint={`Fi${agentLabel(agPick.name)}`}
          quickValues={quickPercents[agPick.name] ?? [0.5, 1, 1.5, 2, 3]}
          value={agPercent != null ? String(agPercent) : ""}
          onValueChange={v => setAgPercent?.(parseFloat(v) || 0)}
          min={0} max={10} step={0.1} precision={1}
          valuePlaceholder="Fi%" unitSuffix="%"
          confirmLabel={activeAgent && activeAgent.name !== agPick.name ? `Switch to ${agentLabel(agPick.name)}` : `Start ${agentLabel(agPick.name)}`}
          onConfirm={onConfirm}
        />
      )}
    </Sheet>
  )
}
