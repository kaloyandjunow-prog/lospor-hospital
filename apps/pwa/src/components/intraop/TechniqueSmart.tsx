import { useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import {
  TECHNIQUE_SIDES, plannedTechniquesLeft, searchTechniques, setTechniqueSide, techniqueHasSide, techniqueSidesFor,
  type TechniqueSide,
} from "@lospor/core/technique-smart"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

type TechniqueNode = { v: string; label: string; isOther?: boolean; children?: TechniqueNode[] }

const SIDE_KEY = { LEFT: "tchLeft", RIGHT: "tchRight", BOTH: "tchBoth" } as const

const leavesOf = (node: TechniqueNode): TechniqueNode[] => (node.children?.length ? node.children.flatMap(leavesOf) : [node])

function findNodePath(value: string, nodes: readonly TechniqueNode[], trail: TechniqueNode[] = []): TechniqueNode[] | undefined {
  for (const node of nodes) {
    const next = [...trail, node]
    if (node.v === value) return next
    if (node.children?.length) {
      const found = findNodePath(value, node.children, next)
      if (found) return found
    }
  }
  return undefined
}

/**
 * The Technique tab, Smart selection (10.2.0), on the phone: what is in use (with the side of a block), the
 * preop plan in one tap, a search across every technique, the clinician's usual ones, and the full list
 * opening in place under four families. Finding, sides and the usual list are Core's (technique-smart);
 * the saved data is still the list of technique codes, with the side beside it by code.
 */
export function TechniqueSmart({ techniques, sides, onChange, tree, label, color, planned, recents, saving = false, saveError = false }: {
  techniques: readonly string[]
  sides: Record<string, TechniqueSide>
  /** The new list and sides; the caller saves both together and remembers what was used. */
  onChange: (techniques: string[], sides: Record<string, TechniqueSide>, added: string[]) => void
  tree: readonly TechniqueNode[]
  label: (code: string) => string
  color: (code: string) => string
  /** Techniques planned at the preop visit. */
  planned: readonly string[]
  recents: readonly string[]
  saving?: boolean
  saveError?: boolean
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [query, setQuery] = useState("")
  const [browsePath, setBrowsePath] = useState<string[]>([])
  const [otherText, setOtherText] = useState("")
  // The breadcrumb above the browser already gives the path. Keep every
  // selectable technique scannable by showing only its leaf name; the full
  // canonical label remains available to assistive technology.
  const shortLabel = (code: string) => code.startsWith("OTHER:")
    ? code.slice(6)
    : findNodePath(code, tree)?.at(-1)?.label ?? label(code)
  const nameOf = shortLabel
  const pillLabel = shortLabel

  function toggle(code: string) {
    const on = techniques.includes(code)
    const next = on ? techniques.filter(item => item !== code) : [...techniques, code]
    onChange(next, techniqueSidesFor(next, sides), on ? [] : [code])
  }
  function usePlan() {
    const left = plannedTechniquesLeft(planned, techniques)
    if (left.length > 0) onChange([...techniques, ...left], sides, left)
  }
  function pickSide(code: string, side: TechniqueSide) {
    onChange([...techniques], setTechniqueSide(sides, code, sides[code] === side ? null : side), [])
  }
  function addOther() {
    const text = otherText.trim()
    if (!text) return
    const code = `OTHER:${text}`
    if (!techniques.includes(code)) onChange([...techniques, code], sides, [])
    setOtherText("")
  }

  const hits = searchTechniques(query, 6, code => [label(code)])
  const planLeft = plannedTechniquesLeft(planned, techniques)
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>{text}</Text>
  const currentNodes = browsePath.length === 0
    ? tree
    : findNodePath(browsePath[browsePath.length - 1]!, tree)?.at(-1)?.children ?? []
  const breadcrumb = browsePath
    .map(code => findNodePath(code, tree)?.at(-1))
    .filter((node): node is TechniqueNode => !!node)

  const renderNode = (node: TechniqueNode, index: number) => {
    if (node.isOther || node.v === "OTHER") {
      return <TextInput key={`${node.v}-${index}`} testID="technique-other" value={otherText} onChangeText={setOtherText} onSubmitEditing={addOther} placeholder={label(node.v)} placeholderTextColor={shade("#475569")}
        style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: shade("#2a3140"), backgroundColor: shade("#171c26"), color: shade("#f8fafc"), paddingHorizontal: 12 }} />
    }
    const isLeaf = !node.children?.length
    if (isLeaf) {
      const on = techniques.includes(node.v)
      return (
        <TouchableOpacity key={`${node.v}-${index}`} testID={`technique-leaf-${node.v}`} accessibilityLabel={label(node.v)} accessibilityState={{ selected: on }} onPress={() => toggle(node.v)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, marginVertical: 3,
            borderColor: on ? shade("#22c55e") : shade("#2a3140"), backgroundColor: on ? shade("#0f2a1a") : shade("#171c26") }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", borderColor: on ? shade("#22c55e") : shade("#334155"), backgroundColor: on ? shade("#22c55e") : "transparent" }}>
            {on ? <Text style={{ color: shade("#04130a"), fontSize: 12, fontWeight: "800" }}>✓</Text> : null}
          </View>
          <Text style={{ color: shade("#f8fafc"), fontSize: 14, flex: 1 }}>{shortLabel(node.v)}</Text>
        </TouchableOpacity>
      )
    }
    const count = leavesOf(node).filter(leaf => techniques.includes(leaf.v)).length
    return (
      <TouchableOpacity key={`${node.v}-${index}`} testID={`technique-node-${node.v}`} accessibilityLabel={label(node.v)} onPress={() => setBrowsePath(path => [...path, node.v])}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: shade("#2a3140"), backgroundColor: shade("#171c26"), paddingHorizontal: 12, marginVertical: 3 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: shade("#222936") }}>
          <Text style={{ color: shade("#94a3b8"), fontSize: 20 }}>›</Text>
        </View>
        <Text style={{ color: shade("#f8fafc"), fontWeight: "700", fontSize: 14, flex: 1 }}>{node.label}</Text>
        <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{count > 0 ? `${formatMessage(tc("tchSelectedCount"), { count })} · ` : ""}{leavesOf(node).length}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View testID="technique-smart">
      {saving ? <Text testID="technique-smart-saving" style={{ color: shade("#94a3b8"), fontSize: 12, marginBottom: 6 }}>{tc("draftSaving")}</Text> : null}
      {saveError ? <Text testID="technique-smart-save-error" style={{ color: shade("#fca5a5"), fontSize: 12, marginBottom: 6 }}>{tc("draftSaveFailed")}</Text> : null}
      {eyebrow(`${tc("tchInUse")}${techniques.length > 0 ? ` · ${techniques.length}` : ""}`)}
      {techniques.length === 0 ? (
        <Text testID="technique-empty" style={{ color: shade("#94a3b8"), fontSize: 13 }}>{tc("tchNothing")}</Text>
      ) : (
        <View style={{ gap: 8 }}>{techniques.map((code, index) => {
          const col = color(code)
          const sided = techniqueHasSide(code)
          return (
            <View key={`${code}-${index}`} testID={`technique-chip-${code}`} style={{ borderRadius: 12, borderWidth: 1, borderColor: col + "55", backgroundColor: col + "20", padding: 8 }}>
              <TouchableOpacity testID={`technique-remove-${code}`} accessibilityLabel={nameOf(code)} onPress={() => toggle(code)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: col, fontWeight: "800", fontSize: 14 }}>{nameOf(code)}</Text>
                </View>
                <Text style={{ color: col + "aa", fontSize: 18 }}>×</Text>
              </TouchableOpacity>
              {sided ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Text style={{ color: sides[code] ? shade("#94a3b8") : shade("#fbbf24"), fontSize: 11, fontWeight: "700", width: 54 }}>{sides[code] ? tc("tchSide") : tc("tchSideNeeded")}</Text>
                  {TECHNIQUE_SIDES.map(side => (
                    <TouchableOpacity key={side} testID={`technique-side-${code}-${side}`} accessibilityState={{ selected: sides[code] === side }} onPress={() => pickSide(code, side)}
                      style={{ minHeight: 44, flex: 1, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center",
                        borderColor: sides[code] === side ? shade("#a67cff") : shade("#334155"), backgroundColor: sides[code] === side ? shade("#a67cff") + "33" : "transparent" }}>
                      <Text style={{ color: sides[code] === side ? shade("#e9ddff") : shade("#e2e8f0"), fontWeight: "700", fontSize: 13 }}>{tc(SIDE_KEY[side])}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}</View>
      )}

      {planLeft.length > 0 ? (
        <>
          {eyebrow(tc("tchPlan"))}
          <View testID="technique-plan" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: shade("#fbbf24"), backgroundColor: shade("#2a2210") }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: shade("#fbbf24"), fontSize: 11, fontWeight: "800" }}>{tc("tchPlanned")}</Text>
              <Text style={{ color: shade("#f8fafc"), fontWeight: "700", fontSize: 14 }}>{planLeft.map(nameOf).join(" + ")}</Text>
            </View>
            <TouchableOpacity testID="technique-use-plan" onPress={usePlan} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: shade("#a67cff"), backgroundColor: shade("#a67cff") + "26", justifyContent: "center" }}>
              <Text style={{ color: shade("#c4b0ff"), fontWeight: "800" }}>{tc("tchUsePlan")}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {eyebrow(tc("tchFind"))}
      <TextInput testID="technique-search" value={query} onChangeText={setQuery} placeholder={tc("tchSearchHint")} placeholderTextColor={shade("#475569")}
        style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: shade("#2a3140"), backgroundColor: shade("#171c26"), color: shade("#f8fafc"), paddingHorizontal: 14, fontSize: 15 }} />
      {query.trim() ? (
        <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: shade("#2a3140"), overflow: "hidden" }}>
          {hits.length === 0 ? <Text style={{ color: shade("#94a3b8"), padding: 12 }}>{tc("tchNoMatch")}</Text> : hits.map(hit => (
            <TouchableOpacity key={hit.code} testID={`technique-hit-${hit.code}`} onPress={() => { toggle(hit.code); setQuery("") }} style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, justifyContent: "center", backgroundColor: shade("#171c26") }}>
              <Text accessibilityLabel={label(hit.code)} style={{ color: shade("#f8fafc"), fontWeight: "700", fontSize: 14 }}>{shortLabel(hit.code)}{techniques.includes(hit.code) ? " ✓" : ""}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : recents.length > 0 ? (
        <>
          {eyebrow(tc("tchUsual"))}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {recents.map((code, index) => {
              const on = techniques.includes(code)
              return (
                <TouchableOpacity key={`${code}-${index}`} testID={`technique-recent-${code}`} accessibilityState={{ selected: on }} onPress={() => toggle(code)}
                  style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: "center",
                    borderColor: on ? shade("#22c55e") : shade("#2a3140"), backgroundColor: on ? shade("#0f2a1a") : shade("#171c26") }}>
                  <Text style={{ color: on ? shade("#86efac") : shade("#e2e8f0"), fontWeight: "700", fontSize: 13 }}>{pillLabel(code)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      ) : null}

      {browsePath.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          <TouchableOpacity onPress={() => setBrowsePath([])}>
            <Text style={{ color: shade("#60a5fa"), fontSize: 12, fontWeight: "700" }}>{tc("tchAll")}</Text>
          </TouchableOpacity>
          {breadcrumb.map((node, index) => (
            <View key={`${node.v}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: shade("#475569"), fontSize: 12 }}>›</Text>
              <TouchableOpacity onPress={() => setBrowsePath(path => path.slice(0, index + 1))}>
                <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{node.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 1 }}>{currentNodes.map((node, index) => renderNode(node, index))}</View>
    </View>
  )
}
