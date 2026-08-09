import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type Agent = { name: string; color: string }

export function AgentSheet({
  visible, onClose, agents, agPick, setAgPick, activeAgent, onConfirm,
  quickPercents = {}, agPercent, setAgPercent, pediatricMode = false,
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
}) {
  const { tc, language } = usePreferences()
  const agentLabel = (name: string) => displayClinicalCode("option:INHALATIONAL_AGENT", name, language, { label: name })

  return (
    <Sheet visible={visible} onClose={onClose} title={tc("sasInhaledAgent")}>
      <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
        {agents.map(a => {
          const defaults = pediatricMode ? [] : quickPercents[a.name] ?? [0.5, 1, 1.5, 2, 3]
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
              {language === "bg"
                ? "\u041f\u0435\u0434\u0438\u0430\u0442\u0440\u0438\u0447\u043d\u0438\u0442\u0435 \u043a\u043e\u043d\u0446\u0435\u043d\u0442\u0440\u0430\u0446\u0438\u0438 \u0432\u0441\u0435 \u043e\u0449\u0435 \u043d\u0435 \u0441\u0430 \u043a\u043b\u0438\u043d\u0438\u0447\u043d\u043e \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0438. \u0412\u044a\u0432\u0435\u0434\u0435\u0442\u0435 \u0440\u044a\u0447\u043d\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u0430 \u0441\u0442\u043e\u0439\u043d\u043e\u0441\u0442."
                : "Pediatric concentrations are not clinically approved yet. Enter a manually verified value."}
            </Text>
          ) : null}
          <DoseSelector
            color={agPick.color}
            hint={`Fi${agentLabel(agPick.name)}`}
            quickValues={pediatricMode ? undefined : quickPercents[agPick.name] ?? [0.5, 1, 1.5, 2, 3]}
            value={agPercent != null ? String(agPercent) : ""}
            onValueChange={v => setAgPercent?.(v.trim() ? parseFloat(v) || 0 : null)}
            min={0} max={10} step={0.1} precision={1}
            valuePlaceholder="Fi%" unitSuffix="%"
            confirmLabel={activeAgent && activeAgent.name !== agPick.name ? `Switch to ${agentLabel(agPick.name)}` : `Start ${agentLabel(agPick.name)}`}
            onConfirm={onConfirm}
            confirmDisabled={pediatricMode && agPercent == null}
          />
        </>
      )}
    </Sheet>
  )
}
