import { Text, TouchableOpacity, View } from "react-native"
import { STRINGS } from "@/i18n/strings"
import type { LocalCaseDraft } from "@/lib/local-case-store"
import { localDraftReviewSummary } from "@/lib/local-draft-review"
import { colors, withAlpha } from "@/theme/colors"

type Props = {
  draft: LocalCaseDraft
  language: string
  localBadge: string
  unsyncedTitle: string
  onPress: () => void
}

function firstLabel(items: unknown[]): string | undefined {
  const first = items[0]
  return first && typeof first === "object" && "label" in first && typeof first.label === "string"
    ? first.label
    : undefined
}

/** A local-only draft or a server-linked recovery action on the dashboard. */
export function LocalCaseDraftCard({
  draft,
  language,
  localBadge,
  unsyncedTitle,
  onPress,
}: Props) {
  const needsReview = Boolean(draft.serverCaseId && draft.syncReview)
  const review = draft.syncReview
    ? localDraftReviewSummary(draft.syncReview, language)
    : null
  const diagnoses = Array.isArray(draft.formValues?.diagnoses) ? draft.formValues.diagnoses : []
  const procedures = Array.isArray(draft.formValues?.procedures) ? draft.formValues.procedures : []
  const title = firstLabel(diagnoses) ?? firstLabel(procedures) ?? unsyncedTitle
  const age = draft.formValues?.ageYears
  const sex = draft.formValues?.sex
  const subtitle = [age ? `${age}y` : null, sex ? String(sex)[0] : null]
    .filter(Boolean)
    .join(" · ")
  const date = new Date(draft.createdAt).toLocaleDateString()

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: withAlpha(needsReview ? colors.danger : colors.warning, "12"),
        borderColor: withAlpha(needsReview ? colors.danger : colors.warning, "55"),
        borderWidth: 1,
        borderRadius: 14,
        borderCurve: "continuous",
        padding: 12,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{
            backgroundColor: needsReview ? colors.danger : colors.warning,
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}>
            <Text style={{ color: "#000", fontSize: 9, fontWeight: "900" }}>
              {needsReview ? STRINGS[language as "en" | "bg"].reviewBadge : localBadge}
            </Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "800" }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {review ? (
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700", marginTop: 4 }}>
            {review}
          </Text>
        ) : subtitle ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
            {subtitle} · {date}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  )
}
