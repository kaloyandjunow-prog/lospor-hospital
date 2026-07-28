import { useState } from "react"
import { View, Text, ScrollView, TouchableOpacity, type ViewStyle } from "react-native"
import { uid } from "@/lib/intraop-log-event"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import type { VascTreeNode } from "@/lib/vascular-access-tree"

type VascularEntry = { id: string; site: string; siteLabel: string; size: string; sizeUnit: string; depthCm: string; lumens?: string; preexisting?: boolean }

function findVascPath(value: string, nodes: VascTreeNode[], path: VascTreeNode[] = []): VascTreeNode[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node]
    if (node.v === value) return nextPath
    const childPath = node.children ? findVascPath(value, node.children, nextPath) : null
    if (childPath) return childPath
  }
  return null
}

function pathLabel(path: VascTreeNode[], canonical = false): string {
  return path.map(node => canonical ? node.canonicalLabel : node.label).join(" › ")
}

export function VascularTab({
  vascularAccesses, setVascularAccesses, saveVascularAccesses, vascularSaving,
  vascSiteColor, vascTree, vascDefaultUnit, vascPreexistingQuick, tc,
}: {
  vascularAccesses: VascularEntry[]
  setVascularAccesses: (next: VascularEntry[]) => void
  saveVascularAccesses: (next: VascularEntry[]) => void
  vascularSaving: boolean
  vascSiteColor: (site: string) => string
  vascTree: VascTreeNode[]
  vascDefaultUnit: (site: string) => string
  vascPreexistingQuick: { v: string; label: string; crumb: string }[]
  tc: (key: ClinicalStringKey) => string
}) {
  const { language } = usePreferences()
  const [vascMode, setVascMode]           = useState<null | "add" | "preexisting">(null)
  const [vascTreePath, setVascTreePath]   = useState<VascTreeNode[]>([])
  const [vascPending, setVascPending]     = useState<{ v: string; label: string; displayCrumb: string; canonicalCrumb: string } | null>(null)
  const [vascDetailUnit, setVascDetailUnit]     = useState("G")
  const [vascDetailSize, setVascDetailSize]     = useState("")
  const [vascDetailDepth, setVascDetailDepth]   = useState("")
  const [vascDetailLumens, setVascDetailLumens] = useState("")

  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {/* Existing accesses — pills */}
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:12 }}>
        {vascularAccesses.map((acc, idx) => {
          const clr = vascSiteColor(acc.site)
          const storedPath = findVascPath(acc.site, vascTree)
          const siteLabel = storedPath
            ? pathLabel(storedPath)
            : displayClinicalCode("option:VASCULAR_ACCESS", acc.site, language, { label: acc.siteLabel })
          const detail = [
            acc.size && acc.sizeUnit ? `${acc.size}${acc.sizeUnit}` : "",
            acc.depthCm ? `${acc.depthCm} cm` : "",
            acc.lumens ? `${acc.lumens} lumen` : "",
          ].filter(Boolean).join(" · ")
          return (
            <View key={acc.id ?? idx} style={{ flexDirection:"row", alignItems:"center", gap:4,
              backgroundColor: acc.preexisting ? "#78350f44" : clr + "33",
              borderRadius:16, paddingHorizontal:10, paddingVertical:6,
              borderWidth:1, borderColor: acc.preexisting ? "#d97706" : clr }}>
              {acc.preexisting && (
                <Text style={{ color:"#f59e0b", fontSize:8, fontWeight:"800", letterSpacing:0.8 }}>{tc("vtPreBadge")}</Text>
              )}
              <Text style={{ color: acc.preexisting ? "#fbbf24" : clr, fontWeight:"700", fontSize:12 }}>
                {siteLabel}{detail ? `  (${detail})` : ""}
              </Text>
              <TouchableOpacity onPress={() => {
                const next = vascularAccesses.filter((_, i) => i !== idx)
                setVascularAccesses(next)
                saveVascularAccesses(next)
              }} style={{ marginLeft:2 }}>
                <Text style={{ color: acc.preexisting ? "#d97706" : clr, fontSize:14, fontWeight:"700" }}>×</Text>
              </TouchableOpacity>
            </View>
          )
        })}
        {/* Action buttons */}
        {!vascMode && (
          <>
            <TouchableOpacity onPress={() => { setVascMode("add"); setVascTreePath([]); setVascPending(null); setVascDetailSize(""); setVascDetailDepth("") }}
              style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:7,
                borderRadius:16, borderWidth:1.5, borderStyle:"dashed" as ViewStyle["borderStyle"], borderColor:"#1e3a5f" }}>
              <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>
                + {vascularAccesses.length === 0 ? "Add vascular access" : "Add"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setVascMode("preexisting"); setVascPending(null); setVascDetailSize(""); setVascDetailDepth("") }}
              style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:7,
                borderRadius:16, borderWidth:1.5, borderStyle:"dashed" as ViewStyle["borderStyle"], borderColor:"#78350f" }}>
              <Text style={{ color:"#f59e0b", fontSize:12, fontWeight:"700" }}>{tc("vtAlreadyInPlace")}</Text>
            </TouchableOpacity>
          </>
        )}
        {vascMode !== null && !vascPending && (
          <TouchableOpacity onPress={() => setVascMode(null)}
            style={{ paddingHorizontal:10, paddingVertical:7, alignItems:"center", justifyContent:"center" }}>
            <Text style={{ color:"#64748b", fontSize:16, fontWeight:"700" }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tree picker — Add new */}
      {vascMode === "add" && !vascPending && (() => {
        const nodes = vascTreePath.length === 0 ? vascTree : (vascTreePath[vascTreePath.length - 1].children ?? [])
        return (
          <View style={{ backgroundColor:"#0d1520", borderRadius:12, borderWidth:1, borderColor:"#1e3a5f", padding:12 }}>
            {vascTreePath.length > 0 && (
              <View style={{ flexDirection:"row", alignItems:"center", flexWrap:"wrap", gap:2, marginBottom:8 }}>
                <TouchableOpacity onPress={() => setVascTreePath([])}>
                  <Text style={{ color:"#3b82f6", fontSize:11 }}>{tc("vtAccess")}</Text>
                </TouchableOpacity>
                {vascTreePath.map((n, i) => (
                  <View key={n.v} style={{ flexDirection:"row", alignItems:"center", gap:2 }}>
                    <Text style={{ color:"#475569", fontSize:11 }}> › </Text>
                    <TouchableOpacity onPress={() => setVascTreePath(p => p.slice(0, i+1))}>
                      <Text style={{ color:"#3b82f6", fontSize:11 }}>{n.label}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
              {nodes.map(node => (
                <TouchableOpacity key={node.v} onPress={() => {
                  if (node.children?.length) { setVascTreePath(p => [...p, node]); return }
                  const selectedPath = [...vascTreePath, node]
                  setVascPending({
                    v: node.v,
                    label: node.label,
                    displayCrumb: pathLabel(selectedPath),
                    canonicalCrumb: pathLabel(selectedPath, true),
                  })
                  setVascDetailUnit(vascDefaultUnit(node.v))
                  setVascDetailSize("")
                  setVascDetailDepth("")
                  setVascDetailLumens("")
                }} style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:8,
                  borderRadius:10, borderWidth:1, borderColor:"#1e3a5f", backgroundColor:"#111827" }}>
                  <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"600" }}>{node.label}</Text>
                  {node.children && <Text style={{ color:"#475569", fontSize:10 }}>›</Text>}
                </TouchableOpacity>
              ))}
            </View>
            {vascTreePath.length > 0 && (
              <TouchableOpacity onPress={() => setVascTreePath(p => p.slice(0,-1))} style={{ marginTop:8 }}>
                <Text style={{ color:"#475569", fontSize:11 }}>{tc("back")}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })()}

      {/* Already in place — quick picker */}
      {vascMode === "preexisting" && !vascPending && (
        <View style={{ backgroundColor:"#1c0e00", borderRadius:12, borderWidth:1, borderColor:"#78350f", padding:12 }}>
          <Text style={{ color:"#f59e0b", fontSize:11, fontWeight:"700", marginBottom:8 }}>{tc("vtSelectPreexisting")}</Text>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
            {vascPreexistingQuick.map(q => (
              <TouchableOpacity key={q.v} onPress={() => {
                const quickPath = findVascPath(q.v, vascTree)
                setVascPending({
                  v: q.v,
                  label: quickPath?.at(-1)?.label ?? displayClinicalCode("option:VASCULAR_ACCESS", q.v, language, { label: q.label }),
                  displayCrumb: quickPath ? pathLabel(quickPath) : displayClinicalCode("option:VASCULAR_ACCESS", q.v, language, { label: q.label }),
                  canonicalCrumb: q.crumb,
                })
                setVascDetailUnit(vascDefaultUnit(q.v))
                setVascDetailSize("")
                setVascDetailDepth("")
                setVascDetailLumens("")
              }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                borderWidth:1, borderColor:"#78350f", backgroundColor:"#111827" }}>
                <Text style={{ color:"#f59e0b", fontSize:12, fontWeight:"600" }}>{displayClinicalCode("option:VASCULAR_ACCESS", q.v, language, { label: q.label })}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { setVascMode("add"); setVascTreePath([]); setVascPending(null) }}
              style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                borderWidth:1, borderColor:"#1e3a5f", backgroundColor:"#111827" }}>
              <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"600" }}>{tc("vtOther")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Detail form — after leaf selected */}
      {vascPending && (() => {
        const isCentral = vascPending.v.startsWith("CVK_") || vascPending.v.startsWith("PICC_")
        const sizePresetsG  = ["14","16","18","20","22"]
        const sizePresetsFr = ["4","5","6","7","8","9"]
        const presets = vascDetailUnit === "G" ? sizePresetsG : sizePresetsFr
        const isPreexisting = vascMode === "preexisting"
        const borderClr = isPreexisting ? "#78350f" : "#1e3a5f"
        const bgClr = isPreexisting ? "#1c0e00" : "#0d1520"
        return (
          <View style={{ backgroundColor:bgClr, borderRadius:12, borderWidth:1, borderColor:borderClr, padding:12 }}>
            <Text style={{ color:"#94a3b8", fontSize:11, marginBottom:10 }}>{vascPending.displayCrumb}</Text>
            <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("vtUnit")}</Text>
            <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
              {["G","Fr"].map(u => (
                <TouchableOpacity key={u} onPress={() => { setVascDetailUnit(u); setVascDetailSize("") }}
                  style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                    backgroundColor: vascDetailUnit === u ? "#3b82f6" : "#1e2d40",
                    borderWidth:1, borderColor:"#3b82f644" }}>
                  <Text style={{ color: vascDetailUnit === u ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Size ({vascDetailUnit})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
              <View style={{ flexDirection:"row", gap:6 }}>
                {presets.map(p => (
                  <TouchableOpacity key={p} onPress={() => setVascDetailSize(p)}
                    style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                      backgroundColor: vascDetailSize === p ? "#3b82f6" : "#1e2d40",
                      borderWidth:1, borderColor:"#3b82f644" }}>
                    <Text style={{ color: vascDetailSize === p ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {isCentral && (
              <>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("vtDepthFromSkin")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                  <View style={{ flexDirection:"row", gap:6 }}>
                    {["2","4","6","8","10","12","14","16","18","20","22","24"].map(d => (
                      <TouchableOpacity key={d} onPress={() => setVascDetailDepth(d)}
                        style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8,
                          backgroundColor: vascDetailDepth === d ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: vascDetailDepth === d ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("vtLumens")}</Text>
                <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
                  {["1","2","3","4+"].map(l => (
                    <TouchableOpacity key={l} onPress={() => setVascDetailLumens(vascDetailLumens === l ? "" : l)}
                      style={{ paddingHorizontal:18, paddingVertical:9, borderRadius:8, alignItems:"center",
                        backgroundColor: vascDetailLumens === l ? "#3b82f6" : "#1e2d40",
                        borderWidth:1, borderColor:"#3b82f644" }}>
                      <Text style={{ color: vascDetailLumens === l ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={{ flexDirection:"row", gap:8 }}>
              <TouchableOpacity disabled={!vascDetailSize} onPress={() => {
                if (!vascDetailSize || !vascPending) return
                const entry: VascularEntry = {
                  id:          uid(),
                  site:        vascPending.v,
                  siteLabel:   vascPending.canonicalCrumb,
                  size:        vascDetailSize,
                  sizeUnit:    vascDetailUnit,
                  depthCm:     vascDetailDepth,
                  lumens:      vascDetailLumens || undefined,
                  preexisting: isPreexisting || undefined,
                }
                const next = [...vascularAccesses, entry]
                setVascularAccesses(next)
                saveVascularAccesses(next)
                setVascMode(null)
                setVascPending(null)
              }} style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                backgroundColor: vascDetailSize ? "#3b82f6" : "#1e2d40",
                borderWidth:1, borderColor:"#3b82f644" }}>
                <Text style={{ color:"#fff", fontWeight:"700", fontSize:14 }}>{tc("vtAdd")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setVascPending(null)}
                style={{ paddingHorizontal:16, paddingVertical:12, borderRadius:10, alignItems:"center",
                  borderWidth:1, borderColor:"#1e2d40" }}>
                <Text style={{ color:"#64748b", fontWeight:"700", fontSize:14 }}>{tc("cancelLabel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })()}

      {vascularSaving && (
        <Text style={{ color:"#64748b", fontSize:11, textAlign:"center", marginTop:12 }}>{tc("draftSaving")}</Text>
      )}
    </ScrollView>
  )
}
