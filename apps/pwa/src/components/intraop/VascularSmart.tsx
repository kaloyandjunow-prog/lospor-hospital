import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import { VASCULAR_CATALOG_LEAVES, suggestedArterialGauge, suggestedPeripheralGauge, vascularChoices, vascularTypeOfSite, type VascularPatient, type VascularType } from "@lospor/core/vascular-smart"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { VascularSmartPanel, type VascularClinicalEvent, type VascularSmartRequest } from "./VascularSmartPanel"

/**
 * The Vascular access tab, Smart selection (10.2.0), on the phone: what is in place first (who placed
 * each line, and Failed on the line itself), then the kinds of access the technique leads with as big
 * cards, the rest behind "More types", and one panel that opens under them. The choices, the suggested
 * sizes and the saving are Core's (vascular-smart), as on the web.
 */
export function VascularSmart({
  lines, onChange, onEvent, onAtomicSave, patient, techniques, startedAt, now, timeZone, siteLabel, timeOf, saving = false, saveError = false,
}: {
  lines: readonly VascularLine[]
  onChange: (next: VascularLine[]) => void
  onEvent?: (event: VascularClinicalEvent) => void
  onAtomicSave?: (next: VascularLine[], event: VascularClinicalEvent) => void
  patient: VascularPatient
  techniques: readonly string[]
  startedAt: string | null
  now: () => string
  timeZone: string | null
  siteLabel: (code: string) => string
  timeOf: (iso: string) => string
  saving?: boolean
  saveError?: boolean
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [request, setRequest] = useState<VascularSmartRequest | null>(null)
  const [showOther, setShowOther] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const choices = vascularChoices(techniques)
  const working = lines.filter(line => !line.failed)
  const ordered = lines.map((line, index) => ({ line, index })).sort((a, b) => Number(!!a.line.failed) - Number(!!b.line.failed) || b.index - a.index)
  const typeName = (type: VascularType, site?: string) => type === "CENTRAL" ? (site?.startsWith("PICC") ? tc("vsmPicc") : tc("vsmCentral")) : tc(type === "PERIPHERAL" ? "vsmPeripheral" : "vsmArterial")
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>{text}</Text>
  const small = { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: shade("#334155"), justifyContent: "center" as const }
  const toggleType = (type: VascularType) => {
    const selected = request?.type === type && request.replacesIndex == null && !request.ward
    setRequest(selected ? null : { type, source: "tab" })
  }
  const selectCatalogSite = (site: typeof VASCULAR_CATALOG_LEAVES[number]) => {
    const selected = request?.site === site.code && request.replacesIndex == null && !request.ward
    setRequest(selected ? null : { type: site.type, centralType: site.centralType, site: site.code, source: "tab" })
  }

  return (
    <View testID="vascular-smart" style={{ marginBottom: 20 }}>
      {saving ? <Text testID="vascular-smart-saving" style={{ color: shade("#94a3b8"), fontSize: 12, marginBottom: 6 }}>{tc("draftSaving")}</Text> : null}
      {saveError ? <Text testID="vascular-smart-save-error" style={{ color: shade("#fca5a5"), fontSize: 12, marginBottom: 6 }}>{tc("draftSaveFailed")}</Text> : null}
      {eyebrow(`${tc("vsmInPlace")}${working.length > 0 ? ` · ${working.length}` : ""}`)}
      {lines.length === 0 ? (
        <View testID="vascular-smart-empty" style={{ borderWidth: 1, borderStyle: "dashed", borderColor: shade("#334155"), borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <Text style={{ color: shade("#94a3b8") }}>{tc("vsmNone")}</Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 16 }}>{ordered.map(({ line, index }) => {
          const type = vascularTypeOfSite(line.site) ?? "PERIPHERAL"
          const detail = [line.depthCm ? `${line.depthCm} cm` : null, line.lumens ? tc("vsmLumenCount").replace("{count}", line.lumens) : null, type === "PERIPHERAL" ? null : siteLabel(line.site)].filter(Boolean).join(" · ")
          const tone = line.failed ? shade("#f87171") : line.preexisting ? shade("#fbbf24") : shade("#a67cff")
          return (
            <View key={`${line.id ?? line.site}-${index}`} testID={`vascular-smart-line-${index}`} style={{ borderWidth: 1, borderStyle: line.failed ? "dashed" : "solid", borderColor: shade("#2a3140"), borderRadius: 12, padding: 10, backgroundColor: shade("#141414"), opacity: line.failed ? 0.75 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: tone, backgroundColor: line.preexisting && !line.failed ? "transparent" : tone }} />
                <Text style={{ flex: 1, color: shade("#f8fafc"), fontWeight: "700", fontSize: 15, textDecorationLine: line.failed ? "line-through" : "none" }}>{line.size ? `${line.size}${line.sizeUnit ?? ""} ` : ""}{typeName(type, line.site)}</Text>
                <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontVariant: ["tabular-nums"] }}>{line.preexisting && !line.insertedAt ? tc("vsmArrivedShort") : line.insertedAt ? timeOf(line.insertedAt) : ""}</Text>
              </View>
              <Text style={{ color: tone, fontSize: 12, fontWeight: "700" }}>{line.failed ? `${tc("vsmFailed")}${line.failedAt ? ` ${timeOf(line.failedAt)}` : ""}` : line.preexisting ? tc("vsmAlreadyInPlace") : tc("vsmPlacedHere")}</Text>
              {detail ? <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{detail}</Text> : null}
              {!line.failed ? (
                <TouchableOpacity testID={`vascular-smart-fail-${index}`} style={[small, { alignSelf: "flex-start", marginTop: 6 }]}
                  onPress={() => setRequest({ type, centralType: line.site.startsWith("PICC") ? "PICC" : "CVK", source: "tab", replacesIndex: index })}>
                  <Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 12 }}>{tc("vsmFailedButton")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        })}</View>
      )}

      {eyebrow(tc("vsmAddAccess"))}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>{choices.main.map(type => {
        const hint = type === "PERIPHERAL" ? `${suggestedPeripheralGauge(patient)}G` : type === "ARTERIAL" ? `${suggestedArterialGauge(patient)}G` : ""
        const on = request?.type === type && request.replacesIndex == null && !request.ward
        return (
          <TouchableOpacity key={type} testID={`vascular-smart-card-${type}`} accessibilityState={{ selected: on }} onPress={() => toggleType(type)}
            style={{ flex: 1, minHeight: 76, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center", padding: 6, borderColor: on ? shade("#a67cff") : shade("#2a3140"), backgroundColor: on ? shade("#a67cff") + "26" : shade("#171c26") }}>
            <Text style={{ color: shade("#f8fafc"), fontWeight: "800", fontSize: 15, textAlign: "center" }}>{typeName(type)}</Text>
            {hint ? <Text style={{ color: shade("#94a3b8"), fontSize: 11 }}>{hint} {tc("vsmSuggested")}</Text> : null}
          </TouchableOpacity>
        )
      })}</View>
      {request && !request.ward && choices.main.includes(request.type) ? (
        <VascularSmartPanel key={`main-${request.type}-${request.site ?? ""}-${request.replacesIndex ?? ""}`} request={request} lines={lines} patient={patient}
          startedAt={startedAt} now={now} timeZone={timeZone} siteLabel={siteLabel}
          onSave={(next, event) => {
            setRequest(null)
            if (event && onAtomicSave) onAtomicSave(next, event)
            else { onChange(next); if (event) onEvent?.(event) }
          }} onClose={() => setRequest(null)} />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {choices.other.length > 0 ? (showOther ? choices.other.map(type => (
          <TouchableOpacity key={type} testID={`vascular-smart-other-${type}`} style={[small, { minHeight: 44 }]} onPress={() => toggleType(type)}><Text style={{ color: shade("#e2e8f0"), fontWeight: "700" }}>{typeName(type)}</Text></TouchableOpacity>
        )) : (
          <TouchableOpacity testID="vascular-smart-more" style={[small, { minHeight: 44, borderColor: "transparent" }]} onPress={() => setShowOther(true)}><Text style={{ color: shade("#a67cff"), fontWeight: "800" }}>{tc("vsmMoreTypes")}</Text></TouchableOpacity>
        )) : null}
        <TouchableOpacity testID="vascular-smart-catalog" accessibilityState={{ expanded: showCatalog }} style={[small, { minHeight: 44, borderColor: "transparent" }]} onPress={() => setShowCatalog(value => !value)}>
          <Text style={{ color: shade("#a67cff"), fontWeight: "800" }}>{tc(showCatalog ? "vsmHideAllSites" : "vsmAllSites")}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="vascular-smart-ward" style={[small, { minHeight: 44, borderStyle: "dashed", borderColor: shade("#fbbf24") }]} onPress={() => setRequest(request?.ward ? null : { type: "PERIPHERAL", source: "tab", ward: true })}>
          <Text style={{ color: shade("#fbbf24"), fontWeight: "700" }}>{typeName("PERIPHERAL")} · {tc("vsmAlreadyOnArrival")}</Text>
        </TouchableOpacity>
      </View>

      {showCatalog ? (
        <View testID="vascular-smart-catalog-list" style={{ borderWidth: 1, borderColor: shade("#334155"), borderRadius: 12, padding: 10, gap: 10, marginBottom: 14 }}>
          {(["PERIPHERAL", "ARTERIAL", "CENTRAL"] as const).map(group => {
            const sites = VASCULAR_CATALOG_LEAVES.filter(site => site.group === group)
            return (
              <View key={group} style={{ gap: 6 }}>
                <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>{typeName(group)}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {sites.map(site => {
                    const selected = request?.site === site.code
                    return (
                      <TouchableOpacity key={site.code} testID={`vascular-smart-catalog-${site.code}`} accessibilityState={{ selected }} style={[small, { minHeight: 42, borderColor: selected ? shade("#a67cff") : shade("#334155"), backgroundColor: selected ? shade("#a67cff") + "33" : "transparent" }]} onPress={() => selectCatalogSite(site)}>
                        <Text style={{ color: selected ? shade("#e9ddff") : shade("#e2e8f0"), fontWeight: "700" }}>{siteLabel(site.code)}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>
      ) : null}

      {request && (request.ward || !choices.main.includes(request.type)) ? (
        <VascularSmartPanel key={`${request.type}-${request.site ?? ""}-${request.replacesIndex ?? ""}-${request.ward ? "w" : ""}`} request={request} lines={lines} patient={patient}
          startedAt={startedAt} now={now} timeZone={timeZone} siteLabel={siteLabel}
          onSave={(next, event) => {
            setRequest(null)
            if (event && onAtomicSave) onAtomicSave(next, event)
            else { onChange(next); if (event) onEvent?.(event) }
          }} onClose={() => setRequest(null)} />
      ) : null}
    </View>
  )
}
