import { useMemo, useState } from "react"
import { Switch, Text, TouchableOpacity, View } from "react-native"
import { normalizePlannedAnaesthesia, type PlannedAnaesthesia } from "@lospor/core/preop-plan"
import { TechniqueTab } from "@/components/intraop/tabs/TechniqueTab"
import { VascularTab } from "@/components/intraop/tabs/VascularTab"
import { localizedOptions } from "@/lib/clinical-display"
import { mapAirwayOptions } from "@/lib/intraop-option-mappers"
import { buildTechniqueTree, techniqueColor, techniqueDisplayLabel } from "@/lib/intraop-technique"
import type { VascularEntry } from "@/lib/intraop-types"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { useOptionLibrary } from "@/lib/use-option-library"
import { buildVascTree, VASC_PREEXISTING_QUICK, vascDefaultUnit, vascSiteColor } from "@/lib/vascular-access-tree"
import { colors, useThemeRefresh } from "@/theme/colors"

function Chips({ options, chosen, onChange, testID }: {
  options: { code: string; label: string }[]
  chosen: string[]
  onChange: (next: string[]) => void
  testID: string
}) {
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(option => {
        const on = chosen.includes(option.code)
        return (
          <TouchableOpacity key={option.code} testID={`${testID}-${option.code}`} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            onPress={() => onChange(on ? chosen.filter(item => item !== option.code) : [...chosen, option.code])}
            style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }}>
            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: on ? "800" : "600" }}>{option.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/**
 * The anaesthesia planned at the preop visit (optional), in the intraoperative
 * record's own menus: the technique and line tabs as intraop draws them, the
 * airway devices and instruments, and ventilation after the operation. The
 * summary prints it; layout C of the consent starts from it.
 */
export function PlannedAnaesthesiaSection({ value, onChange, language, tc }: {
  value: unknown
  onChange: (next: PlannedAnaesthesia) => void
  language: string
  tc: (key: ClinicalStringKey) => string
}) {
  useThemeRefresh()
  const plan = normalizePlannedAnaesthesia(value)
  const set = (patch: Partial<PlannedAnaesthesia>) => onChange({ ...plan, ...patch })
  const lang = language === "bg" ? "bg" : "en"

  const { options: techniqueOptions } = useOptionLibrary("TECHNIQUE")
  const techniqueTree = useMemo(() => buildTechniqueTree(localizedOptions("TECHNIQUE", techniqueOptions, lang)), [lang, techniqueOptions])
  const { options: vascularOptions } = useOptionLibrary("VASCULAR_ACCESS")
  const vascTree = useMemo(() => buildVascTree(vascularOptions, lang), [lang, vascularOptions])
  const { options: airwayOptions } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const devices = useMemo(() => mapAirwayOptions(localizedOptions("AIRWAY_MANAGEMENT", airwayOptions, lang), "Device"), [airwayOptions, lang])
  const tools = useMemo(() => mapAirwayOptions(localizedOptions("AIRWAY_MANAGEMENT", airwayOptions, lang), "Instrument"), [airwayOptions, lang])

  const [techPath, setTechPath] = useState<string[]>([])
  const [otherTechText, setOtherTechText] = useState("")
  const heading = { color: colors.textMuted, fontSize: 11, fontWeight: "800" as const, letterSpacing: 1, textTransform: "uppercase" as const }

  return (
    <View testID="preop-planned-anaesthesia" style={{ gap: 10, marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800" }}>{tc("plannedAnaesthesia")}</Text>
      <Text style={heading}>{tc("summaryTechnique")}</Text>
      {/* The intraop tab scrolls inside itself; here it gets a fixed window in the form. */}
      <View style={{ height: 360, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        <TechniqueTab
          techPath={techPath} setTechPath={setTechPath} techniqueTree={techniqueTree}
          techniques={plan.techniques} setTechniques={techniques => set({ techniques })} saveTechniques={() => {}}
          techniqueColor={techniqueColor} techniqueLabel={code => techniqueDisplayLabel(code, techniqueTree)}
          otherTechText={otherTechText} setOtherTechText={setOtherTechText} tc={tc}
        />
      </View>
      <Text style={heading}>{tc("summaryAirwayDevice")}</Text>
      <Chips options={devices} chosen={plan.airwayDevices} onChange={airwayDevices => set({ airwayDevices })} testID="preop-planned-device" />
      <Text style={heading}>{tc("summaryAirwayTools")}</Text>
      <Chips options={tools} chosen={plan.airwayTools} onChange={airwayTools => set({ airwayTools })} testID="preop-planned-tool" />
      <Text style={heading}>{tc("summaryVascular")}</Text>
      <View style={{ height: 360, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        <VascularTab
          vascularAccesses={plan.vascularAccesses as VascularEntry[]}
          setVascularAccesses={vascularAccesses => set({ vascularAccesses })} saveVascularAccesses={() => {}} vascularSaving={false}
          vascSiteColor={vascSiteColor} vascTree={vascTree} vascDefaultUnit={vascDefaultUnit} vascPreexistingQuick={VASC_PREEXISTING_QUICK} tc={tc}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Switch testID="preop-planned-ventilation" value={plan.postopVentilation} onValueChange={postopVentilation => set({ postopVentilation })} />
        <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>{tc("plannedPostopVentilation")}</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>{tc("plannedAnaesthesiaHint")}</Text>
    </View>
  )
}
