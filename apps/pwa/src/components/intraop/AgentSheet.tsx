import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { agentEntry, type AgentRuleProfile } from "@lospor/core/agent-entry"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { useShade } from "@/theme/shade"

type Agent = { name: string; color: string }

export function AgentSheet({
  visible, onClose, agents, agPick, setAgPick, activeAgent, onConfirm,
  agPercent, setAgPercent,
  runningNames = [], agentRule,
}: {
  visible: boolean
  onClose: () => void
  agents: Agent[]
  agPick: Agent | null
  setAgPick: (a: Agent) => void
  activeAgent: Agent | null
  onConfirm: () => void

  agPercent?: number | null
  setAgPercent?: (p: number | null) => void
  /** Agents already running: starting one of them again changes its concentration. */
  runningNames?: string[]
  /** The active clinical rule for an agent (range, step, quick buttons); the catalogue answers when none. */
  agentRule?: (name: string) => AgentRuleProfile | null
}) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const agentLabel = (name: string) => displayClinicalCode("option:INHALATIONAL_AGENT", name, language, { label: name })
  // One entry for web and phone (core): the agent's own range and step, and
  // quick values only where something is suggested.
  const entryFor = (name: string) => agentEntry(name, agentRule?.(name))
  const entry = agPick ? entryFor(agPick.name) : null

  return (
    <Sheet visible={visible} onClose={onClose} title={tc("sasInhaledAgent")}>
      <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
        {agents.map(a => {
          return (
            <TouchableOpacity key={a.name} onPress={() => { setAgPick(a); setAgPercent?.(entryFor(a.name).prefill) }}
              style={{ flex:1, paddingVertical:18, borderRadius:14, alignItems:"center",
                backgroundColor: agPick?.name===a.name ? a.color : a.color+"1a",
                borderWidth:2, borderColor:a.color }}>
              <Text style={{ color: agPick?.name===a.name ? shade("#fff") : a.color,
                fontWeight:"700", fontSize:14 }}>{agentLabel(a.name)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {agPick && entry && (
        <>

          <Text style={{ color: agPick.color, fontSize:12, fontWeight:"600", marginBottom:10 }}>
            {`Fi${agentLabel(agPick.name)}`}
          </Text>
          <DoseSelector
            color={agPick.color}
            quickValues={[...entry.quickValues]}
            value={agPercent != null ? String(agPercent) : ""}
            onValueChange={v => setAgPercent?.(v.trim() ? parseFloat(v) || 0 : null)}
            min={entry.min} max={entry.max} step={entry.step} sliderStep={entry.sliderStep} precision={entry.precision}
            valuePlaceholder="Fi%" unitSuffix="%"
            confirmLabel={formatMessage(
              tc(runningNames.includes(agPick.name) ? "changeAgent"
                : activeAgent && activeAgent.name !== agPick.name ? "switchToAgent" : "startAgent"),
              { name: agentLabel(agPick.name) },
            )}
            onConfirm={onConfirm}
            confirmDisabled={(agPercent ?? 0) <= 0}
          />
        </>
      )}
    </Sheet>
  )
}
