import { View, Text, Switch, ActivityIndicator, type TextStyle } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { Card, PrimaryButton, SectionHeader } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedSection = { title: string; body: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSections(text: string): ParsedSection[] {
  const parts = text.split(/\n## /)
  return parts
    .map((p, i) => {
      const lines = p.split("\n")
      const title = i === 0 ? lines[0].replace(/^## /, "") : lines[0]
      const body = lines.slice(1).join("\n").trim()
      return { title, body }
    })
    .filter(s => s.title && s.body)
}

// ─── Lightweight Markdown renderer ───────────────────────────────────────────
// Handles the subset the AI uses: **bold**, *italic*, `code`, - bullets, numbered lists.
// React Native Text doesn't parse Markdown natively so we do it here.

function renderInline(text: string, baseStyle: TextStyle): React.ReactNode {
  // Split on **bold** and *italic* spans
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Text key={i} style={{ ...baseStyle, fontWeight: "800", color: colors.textPrimary }}>{part.slice(2, -2)}</Text>
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <Text key={i} style={{ ...baseStyle, fontStyle: "italic" }}>{part.slice(1, -1)}</Text>
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <Text key={i} style={{ ...baseStyle, fontFamily: "monospace", color: colors.textSecondary }}>{part.slice(1, -1)}</Text>
    }
    return <Text key={i} style={baseStyle}>{part}</Text>
  })
}

function MarkdownBody({ text }: { text: string }) {
  const baseStyle: TextStyle = { color: colors.textSecondary, fontSize: 14, lineHeight: 21 }
  const lines = text.split("\n")

  return (
    <View style={{ gap: 3 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd()

        // Blank line → small spacer
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />

        // Horizontal rule
        if (/^---+$/.test(line)) return <View key={i} style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />

        // Bullet point: - or * or •
        if (/^[-*•]\s+/.test(line)) {
          const content = line.replace(/^[-*•]\s+/, "")
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ ...baseStyle, color: colors.textMuted, lineHeight: 21 }}>•</Text>
              <Text style={{ ...baseStyle, flex: 1 }}>{renderInline(content, baseStyle)}</Text>
            </View>
          )
        }

        // Numbered list: 1. or 1)
        const numMatch = line.match(/^(\d+)[.)]\s+(.*)/)
        if (numMatch) {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ ...baseStyle, color: colors.textMuted, minWidth: 18 }}>{numMatch[1]}.</Text>
              <Text style={{ ...baseStyle, flex: 1 }}>{renderInline(numMatch[2], baseStyle)}</Text>
            </View>
          )
        }

        // Sub-header (### or ####) — render as small bold label
        const hMatch = line.match(/^#{3,}\s+(.+)/)
        if (hMatch) {
          return <Text key={i} style={{ ...baseStyle, fontWeight: "800", color: colors.textPrimary, marginTop: 6 }}>{hMatch[1]}</Text>
        }

        // Regular paragraph line
        return <Text key={i} style={baseStyle}>{renderInline(line, baseStyle)}</Text>
      })}
    </View>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GdprCard({
  aiOptIn,
  onToggle,
  privacyNote,
  enableLabel,
}: {
  aiOptIn: boolean
  onToggle: (v: boolean) => void
  privacyNote: string
  enableLabel: string
}) {
  return (
    <Card className="border-l-4 border-amber-500 px-4 py-4 mb-4">
      <Text className="text-slate-300 text-sm leading-relaxed mb-4">
        {privacyNote}
      </Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-slate-200 text-sm font-medium flex-1 mr-3">
          {enableLabel}
        </Text>
        <Switch
          value={aiOptIn}
          onValueChange={onToggle}
          trackColor={{ false: colors.borderStrong, true: colors.agent }}
          thumbColor="#fff"
        />
      </View>
    </Card>
  )
}

function DisclaimerBanner({ text }: { text: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        backgroundColor: withAlpha(colors.warning, "1A"),
        borderWidth: 1,
        borderColor: withAlpha(colors.warning, "40"),
        borderRadius: 12,
        borderCurve: "continuous",
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
      }}
    >
      <Ionicons name="alert-circle-outline" size={16} color={colors.warning} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, color: colors.warning, fontSize: 12, lineHeight: 17 }}>{text}</Text>
    </View>
  )
}

function AnalysingState({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 py-6 justify-center">
      <ActivityIndicator color={colors.agent} />
      <Text className="text-slate-400 text-sm italic">{label}</Text>
    </View>
  )
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card className="px-4 py-4 mb-4 border-red-800">
      <Text className="text-red-400 text-sm mb-4">{message}</Text>
      <PrimaryButton label="Retry" color="red" onPress={onRetry} />
    </Card>
  )
}

function AiResultCard({ title, body }: ParsedSection) {
  return (
    <Card className="px-4 py-4 mb-3">
      <Text className="text-blue-400 font-semibold text-sm mb-3">{title}</Text>
      <MarkdownBody text={body} />
    </Card>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AiAdvisorPanel({
  aiOptIn,
  onToggleOptIn,
  analysing,
  streamedText,
  error,
  onRun,
  tc,
}: {
  aiOptIn: boolean
  onToggleOptIn: (v: boolean) => void
  analysing: boolean
  streamedText: string
  error: string | null
  onRun: () => void
  tc: (key: ClinicalStringKey) => string
}) {
  const sections = parseSections(streamedText)

  return (
    <View>
      <GdprCard
        aiOptIn={aiOptIn}
        onToggle={onToggleOptIn}
        privacyNote={tc("aiPrivacyNote")}
        enableLabel={tc("aiEnableLabel")}
      />

      {aiOptIn && (
        <View className="mb-3">
          <PrimaryButton
            label={tc("aiAnalyseBtn")}
            color="violet"
            onPress={onRun}
            disabled={analysing}
            loading={false}
          />
        </View>
      )}

      {(analysing || sections.length > 0) && (
        <DisclaimerBanner text={tc("aiDisclaimer")} />
      )}

      {analysing && <AnalysingState label={tc("aiAnalysing")} />}

      {error && !analysing && (
        <ErrorCard message={error} onRetry={onRun} />
      )}

      {sections.length > 0 && (
        <>
          <SectionHeader title={tc("aiAnalysisSection")} />
          {sections.map((s, i) => (
            <AiResultCard key={i} title={s.title} body={s.body} />
          ))}
        </>
      )}
    </View>
  )
}
