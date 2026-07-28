import { useState } from "react"
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import type * as ImagePickerModule from "expo-image-picker"
import { apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

// Lazy require — native module is only present after a full expo run:android build.
 
function getImagePicker(): typeof ImagePickerModule | null {
  try { return require("expo-image-picker") } catch { return null }
}

export type LabResult = { test: string; value: string; unit: string }

type Props = {
  value: LabResult[]
  onAddResults: (results: LabResult[]) => void
}

export function LabScanPanel({ value, onAddResults }: Props) {
  const { tc } = usePreferences()
  const [scanning, setScanning] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [results, setResults] = useState<(LabResult & { selected: boolean })[]>([])

  async function pick(source: "camera" | "library") {
    const ImagePicker = getImagePicker()
    if (!ImagePicker) {
      notify(tc("lspNotAvailableTitle"), tc("lspNotAvailableMsg"))
      return
    }

    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      notify(tc("lspPermissionTitle"), tc("lspPermissionMsg"))
      return
    }

    const picked = source === "camera"
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.85, base64: true })

    if (picked.canceled || !picked.assets[0]) return
    const asset = picked.assets[0]

    // expo-image-picker on web returns a blob URI but may not populate .base64 —
    // fall back to FileReader so the API always receives raw base64.
    let imageBase64: string | null = asset.base64 ?? null
    if (!imageBase64 && asset.uri && Platform.OS === "web") {
      try {
        const r = await fetch(asset.uri)
        const blob = await r.blob()
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "")
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      } catch { /* imageBase64 stays null */ }
    }
    if (!imageBase64) return

    setScanning(true)
    try {
      const data = await apiJson<{ results: LabResult[] }>("/api/ai/read-labs", {
        method: "POST",
        body: JSON.stringify({
          imageBase64,
          mimeType: asset.mimeType ?? "image/jpeg",
        }),
      })
      const imported = (data.results ?? []).map((r) => ({ ...r, selected: !value.some((existing) => existing.test === r.test) }))
      setResults(imported)
      setReviewOpen(true)
    } catch (err) {
      notify(tc("lspScanFailedTitle"), err instanceof Error ? err.message : tc("lspScanFailedMsg"))
    } finally {
      setScanning(false)
    }
  }

  function update(idx: number, patch: Partial<LabResult & { selected: boolean }>) {
    setResults((current) => current.map((row, rowIdx) => rowIdx === idx ? { ...row, ...patch } : row))
  }

  function addSelected() {
    const selected = results
      .filter((r) => r.selected && r.test.trim())
      .map(({ selected: _selected, ...row }) => row)
      .filter((row) => !value.some((existing) => existing.test === row.test))
    onAddResults(selected)
    setReviewOpen(false)
  }

  return (
    <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.primary, "44"), padding: 14, gap: 10, marginBottom: 14 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "900" }}>{tc("lspScanLabReport")}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
        Crop out patient names, date of birth, IDs, and barcodes before uploading. Review every extracted value before adding it.
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={() => pick("camera")} disabled={scanning} style={{ flex: 1, borderRadius: 12, borderCurve: "continuous", backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: withAlpha(colors.primary, "66"), paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>{tc("lspCamera")}</Text>
        </Pressable>
        <Pressable onPress={() => pick("library")} disabled={scanning} style={{ flex: 1, borderRadius: 12, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontWeight: "900", fontSize: 13 }}>{tc("lspGallery")}</Text>
        </Pressable>
      </View>
      {scanning ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>{tc("lspReadingReport")}</Text>
        </View>
      ) : null}

      <Modal visible={reviewOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReviewOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900" }}>{tc("lspReviewLabs")}</Text>
            <Pressable onPress={() => setReviewOpen(false)}>
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "800" }}>{tc("lspClose")}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 90 }}>
            {results.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 32 }}>No lab results found.</Text>
            ) : results.map((row, idx) => (
              <View key={`${row.test}-${idx}`} style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: row.selected ? withAlpha(colors.primary, "66") : colors.border, padding: 12, gap: 8 }}>
                <Pressable onPress={() => update(idx, { selected: !row.selected })} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "900" }}>{row.selected ? tc("lspAdd") : tc("lspSkip")}</Text>
                  <Text style={{ color: row.selected ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: "900" }}>{row.selected ? tc("lspSelected") : tc("lspSkipped")}</Text>
                </Pressable>
                <TextInput value={row.test} onChangeText={(text) => update(idx, { test: text })} style={{ color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput value={row.value} onChangeText={(text) => update(idx, { value: text })} style={{ flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }} />
                  <TextInput value={row.unit} onChangeText={(text) => update(idx, { unit: text })} style={{ flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }} />
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={addSelected} style={{ position: "absolute", left: 16, right: 16, bottom: 22, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.primary, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>{tc("lspAddSelected")}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}
