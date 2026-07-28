import React from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput } from "react-native"
import type { ClinicalStringKey } from "@/lib/preferences-context"

type TechniqueNode = { v: string; label: string; isOther?: boolean; children?: TechniqueNode[] }

export function TechniqueTab({
  techPath, setTechPath, techniqueTree, techniques, setTechniques, saveTechniques,
  techniqueColor, techniqueLabel, otherTechText, setOtherTechText, tc,
}: {
  techPath: string[]
  setTechPath: (updater: (p: string[]) => string[]) => void
  techniqueTree: TechniqueNode[]
  techniques: string[]
  setTechniques: (next: string[]) => void
  saveTechniques: (next: string[]) => void
  techniqueColor: (v: string) => string
  techniqueLabel: (v: string) => string
  otherTechText: string
  setOtherTechText: (v: string) => void
  tc: (key: ClinicalStringKey) => string
}) {
  // Current nodes to display — drill down through techPath
  let currentNodes: TechniqueNode[] = techniqueTree
  const breadcrumbs: TechniqueNode[] = []
  for (const code of techPath) {
    const node = currentNodes.find(n => n.v === code)
    if (!node) break
    breadcrumbs.push(node)
    currentNodes = node.children ?? []
  }
  const showOtherInput = techPath[techPath.length - 1] === "OTHER"

  return (
    <View style={{ flex:1 }}>
      {/* Selected chips */}
      {techniques.length > 0 && (
        <View style={{ paddingHorizontal:14, paddingTop:12, paddingBottom:10,
          borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
          <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700",
            letterSpacing:1.1, textTransform:"uppercase", marginBottom:8 }}>In use</Text>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:7 }}>
            {techniques.map(t => {
              const col = techniqueColor(t)
              return (
                <TouchableOpacity key={t} onPress={() => {
                  const next = techniques.filter(x => x !== t)
                  setTechniques(next); saveTechniques(next)
                }} style={{
                  flexDirection:"row", alignItems:"center", gap:6,
                  paddingHorizontal:11, paddingVertical:7, borderRadius:10,
                  backgroundColor: col + "20", borderWidth:1, borderColor: col + "55",
                }}>
                  <Text style={{ color: col, fontSize:12, fontWeight:"700" }}>
                    {techniqueLabel(t)}
                  </Text>
                  <Text style={{ color: col + "aa", fontSize:13, fontWeight:"300" }}>×</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <View style={{ flexDirection:"row", alignItems:"center", gap:0,
          paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1, borderBottomColor:"#1a2030" }}>
          <TouchableOpacity onPress={() => setTechPath(() => [])} style={{ paddingRight:6 }}>
            <Text style={{ color:"#475569", fontSize:12 }}>All</Text>
          </TouchableOpacity>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.v}>
              <Text style={{ color:"#2a3a4a", fontSize:12 }}> › </Text>
              <TouchableOpacity onPress={() => setTechPath(p => p.slice(0, i + 1))}>
                <Text style={{ color: i === breadcrumbs.length - 1 ? "#94a3b8" : "#475569", fontSize:12 }}>{b.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      )}

      <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:14, paddingBottom:40 }}>
        {/* Back button */}
        {techPath.length > 0 && !showOtherInput && (
          <TouchableOpacity onPress={() => setTechPath(p => p.slice(0, -1))}
            style={{ flexDirection:"row", alignItems:"center", gap:6, marginBottom:14,
              paddingVertical:8 }}>
            <Text style={{ color:"#3b82f6", fontSize:14 }}>←</Text>
            <Text style={{ color:"#3b82f6", fontSize:13, fontWeight:"600" }}>Back</Text>
          </TouchableOpacity>
        )}

        {/* Other free-text input */}
        {showOtherInput ? (
          <View>
            <Text style={{ color:"#94a3b8", fontSize:11, marginBottom:10 }}>
              Describe the technique:
            </Text>
            <TextInput
              style={{ backgroundColor:"#111111", color:"#f8fafc", borderRadius:10,
                padding:12, fontSize:14, borderWidth:1, borderColor:"#2a3a4a" }}
              placeholder="e.g. Ketamine dissociative"
              placeholderTextColor="#475569"
              value={otherTechText}
              onChangeText={setOtherTechText}
              autoFocus
            />
            <TouchableOpacity
              onPress={() => {
                if (!otherTechText.trim()) return
                const code = `OTHER:${otherTechText.trim()}`
                if (!techniques.includes(code)) {
                  const next = [...techniques, code]
                  setTechniques(next); saveTechniques(next)
                }
                setOtherTechText(""); setTechPath(() => [])
              }}
              style={{ marginTop:12, borderRadius:10, paddingVertical:13, alignItems:"center",
                backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#64748b44" }}>
              <Text style={{ color:"#94a3b8", fontWeight:"700", fontSize:14 }}>Add technique</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setOtherTechText(""); setTechPath(() => []) }}
              style={{ marginTop:8, paddingVertical:10, alignItems:"center" }}>
              <Text style={{ color:"#475569", fontSize:13 }}>{tc("cancelLabel")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap:8 }}>
            {currentNodes.map(node => {
              const isLeaf = !node.children || node.children.length === 0
              const isSelected = isLeaf && techniques.includes(node.v)
              const col = techniqueColor(node.v)
              return (
                <TouchableOpacity
                  key={node.v}
                  onPress={() => {
                    if (node.isOther) { setTechPath(p => [...p, node.v]); return }
                    if (isLeaf) {
                      const next = isSelected
                        ? techniques.filter(x => x !== node.v)
                        : [...techniques, node.v]
                      setTechniques(next); saveTechniques(next)
                    } else {
                      setTechPath(p => [...p, node.v])
                    }
                  }}
                  style={{
                    flexDirection:"row", alignItems:"center",
                    paddingHorizontal:14, paddingVertical:13, borderRadius:12,
                    backgroundColor: isSelected ? col + "20" : "#111111",
                    borderWidth:1, borderColor: isSelected ? col + "66" : "#1e2d40",
                  }}
                >
                  <View style={{ flex:1 }}>
                    <Text style={{ color: isSelected ? col : "#e2e8f0",
                      fontSize:14, fontWeight: isSelected ? "700" : "500" }}>
                      {node.label}
                    </Text>
                  </View>
                  {isSelected && (
                    <Text style={{ color: col, fontSize:16, marginRight:4 }}>✓</Text>
                  )}
                  {!isLeaf && (
                    <Text style={{ color:"#475569", fontSize:16 }}>›</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </ScrollView>
      {/* Gas settings (FGF/carrier gas/FiO2) moved to its own timetable row —
          see the Gas Settings vertical lane, gated by the same GA-technique
          visibility this tab used to gate the old static fields with. */}
    </View>
  )
}
