import { useMemo, useState } from "react"
import { Modal, Pressable, ScrollView, Text, View } from "react-native"
import { applyEhrSelections } from "@lospor/core/ehr-import-apply"
import { visibleReviewItems, type EhrReviewItem, type EhrReviewPlan } from "@lospor/core/ehr-import-review"
import type { EhrUnreadSource } from "@lospor/core/ehr-import-transport"
import type { ClinicalMode } from "@lospor/core/pediatric"
import type { EhrLabValue, EhrTagValue } from "@lospor/core/ehr-import"
import { notify } from "@/lib/notify"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

/**
 * Review what the hospital system sent, before any of it is written.
 *
 * Every decision about *what* to show and *what may be ticked* is made in Core
 * and arrives in the plan; this renders it. Keeping the judgement out of the
 * component is what lets web and this screen behave identically — and it is why
 * an age that would change the clinical mode cannot be accepted here no matter
 * what the UI does, because `applyEhrSelections` refuses it on the way out as
 * well.
 *
 * The same file serves native and the PWA. That matters more than usual: those
 * are the two clients with no conflict UI, so a review they could skip would be
 * a value written with nobody told.
 */

type Props = {
  plan: EhrReviewPlan
  /**
   * Groups the hospital system could not be read for.
   *
   * The danger runs the wrong way round here. A failed allergy fetch and a
   * patient with no known allergies both produce an empty list, and the
   * empty list reads as reassurance -- so silence lets somebody conclude
   * there are no allergies when nobody managed to ask.
   */
  unreadSources?: EhrUnreadSource[]
  /**
   * The patient behind this import was matched on the record number alone,
   * because the site has not yet said which of its numberings a record
   * number belongs to.
   *
   * Said out loud rather than swallowed. A hospital numbers the same person
   * several ways, so one clean match can belong to a different numbering --
   * and this sheet is where somebody is about to accept a stranger's allergy
   * list on the strength of it.
   */
  identityUnverified?: boolean
  /** The case as it stands, by canonical field name. */
  current: Record<string, unknown>
  /** Decides which fields an accepted age is written into. */
  currentClinicalMode?: ClinicalMode | null
  /** Field labels come from wherever the form already keeps them. */
  labelFor: (field: string) => string
  onAccept: (patch: Record<string, unknown>, appliedKeys: string[]) => void
  /** Remembered by the server so the item is never offered again. */
  onDecline: (itemKey: string) => void
  /**
   * Take the clinician to the mode control.
   *
   * This sheet covers the screen, so without it a blocked age is a dead end:
   * the row says to switch mode and the control is behind the sheet. The host
   * closes this and puts the toggle in front of them. Reopening rebuilds the
   * plan from the server, and the age is then an ordinary proposal — the only
   * thing lost is local ticks, which the mode change has invalidated anyway.
   */
  onRequestModeChange?: () => void
  onClose: () => void
}

function describe(
  item: EhrReviewItem,
  undatedLabel: string,
  takenLabel: string,
): { title: string; detail?: string } {
  const proposed = item.proposed
  if (proposed && typeof proposed === "object") {
    if ("takenAt" in (proposed as object)) {
      const lab = proposed as EhrLabValue
      return {
        title: `${lab.test} ${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`,
        // Never silent. An undated result beside dated ones would otherwise
        // read as current, and a preoperative haemoglobin is only worth
        // anything if you know how old it is.
        detail: lab.takenAt === null
          ? undatedLabel
          : `${takenLabel} ${lab.takenAt.slice(0, 10)}`,
      }
    }
    const tag = proposed as EhrTagValue
    const parts = [tag.dose, tag.route, tag.frequency].filter(Boolean)
    return { title: tag.label, detail: parts.length ? parts.join(" · ") : tag.code }
  }
  return { title: proposed === null ? "—" : String(proposed) }
}

const GROUP_LABELS = {
  labs: "ehrGroupLabs",
  diagnoses: "ehrGroupDiagnoses",
  allergies: "ehrGroupAllergies",
  medications: "ehrGroupMedications",
  procedures: "ehrGroupProcedures",
} as const

function labTest(item: EhrReviewItem): string {
  const proposed = item.proposed as { test?: string } | null
  return typeof proposed?.test === "string" ? proposed.test.trim().toLowerCase() : ""
}

export function EhrImportPanel({
  plan, identityUnverified, unreadSources = [], current, currentClinicalMode, labelFor,
  onAccept, onDecline, onRequestModeChange, onClose,
}: Props) {
  const { tc } = usePreferences()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(plan.preselectedKeys))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const visible = useMemo(() => visibleReviewItems(plan), [plan])

  // Older results stay out of the way until asked for. A falling haemoglobin is
  // the interesting part, so they are collapsed rather than dropped.
  const shown = visible.filter(item =>
    item.state !== "superseded" || expanded.has(labTest(item)))

  function toggle(item: EhrReviewItem) {
    if (item.state === "needs-mode-decision") {
      notify(tc("ehrModeBlockedTitle"), tc("ehrModeBlockedMsg"))
      return
    }
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(item.itemKey)) next.delete(item.itemKey)
      else next.add(item.itemKey)
      return next
    })
  }

  function decline(item: EhrReviewItem) {
    setSelected(previous => {
      const next = new Set(previous)
      next.delete(item.itemKey)
      return next
    })
    onDecline(item.itemKey)
  }

  function accept() {
    const result = applyEhrSelections({
      plan, selectedKeys: selected, current, currentClinicalMode,
    })
    onAccept(result.patch, result.appliedKeys)
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900" }}>{tc("ehrTitle")}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "800" }}>{tc("lspClose")}</Text>
          </Pressable>
        </View>

        {identityUnverified ? (
          <View
            accessibilityRole="alert"
            style={{
              borderWidth: 1,
              borderColor: colors.warning,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
              {tc("ehrIdentityUnverified")}
            </Text>
          </View>
        ) : null}

        {unreadSources.length > 0 ? (
          <View
            accessibilityRole="alert"
            style={{
              borderWidth: 1,
              borderColor: colors.danger,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
              {tc("ehrUnreadSources")}{" "}
              {unreadSources.map(source => tc(GROUP_LABELS[source.group])).join(", ")}
            </Text>
            <Text style={{ color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
              {tc("ehrUnreadWarning")}
            </Text>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 90 }}>
          {shown.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 32 }}>
              {tc("ehrNothingToReview")}
            </Text>
          ) : shown.map(item => {
            const isSelected = selected.has(item.itemKey)
            const blocked = item.state === "needs-mode-decision"
            const { title, detail } = describe(item, tc("ehrUndated"), tc("ehrTakenAt"))
            return (
              <View
                key={item.itemKey}
                style={{
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: 14,
                  borderCurve: "continuous",
                  borderWidth: 1,
                  borderColor: blocked
                    ? withAlpha(colors.warning, "88")
                    : isSelected ? withAlpha(colors.primary, "66") : colors.border,
                  padding: 12,
                  gap: 8,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {labelFor(item.field)}
                </Text>

                <Pressable
                  onPress={() => toggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected, disabled: blocked }}
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "900" }}>{title}</Text>
                    {detail ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{detail}</Text>
                    ) : null}
                  </View>
                  <Text style={{ color: isSelected ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: "900" }}>
                    {isSelected ? tc("lspSelected") : tc("lspSkipped")}
                  </Text>
                </Pressable>

                {/* Their own value stays on screen beside the proposal — the
                    point of a conflict row is that they compare the two. */}
                {item.state === "conflict" ? (
                  <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {tc("ehrCurrentValue")}: <Text style={{ fontWeight: "900" }}>{String(item.current ?? "—")}</Text>
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{tc("ehrConflictNote")}</Text>
                  </View>
                ) : null}

                {/* A dead end otherwise: the row says to switch mode and the
                    control is behind this sheet. */}
                {blocked ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
                      {tc("ehrModeBlockedTitle")}
                    </Text>
                    {onRequestModeChange ? (
                      <Pressable
                        onPress={onRequestModeChange}
                        style={{ borderRadius: 10, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.warning, "88"), paddingVertical: 10, alignItems: "center" }}
                      >
                        <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "900" }}>
                          {tc("ehrGoToMode")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <Pressable onPress={() => decline(item)} hitSlop={8}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{tc("ehrDecline")}</Text>
                </Pressable>
              </View>
            )
          })}

          {Object.entries(plan.supersededCountByTest).map(([test, count]) => (
            <Pressable
              key={`earlier-${test}`}
              onPress={() => setExpanded(previous => {
                const next = new Set(previous)
                if (next.has(test)) next.delete(test)
                else next.add(test)
                return next
              })}
              style={{ paddingVertical: 8, alignItems: "center" }}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>
                {expanded.has(test) ? "− " : "+ "}{test.toUpperCase()} · {count} {tc("ehrEarlierResults")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={accept}
          disabled={selected.size === 0}
          style={{
            position: "absolute", left: 16, right: 16, bottom: 22,
            borderRadius: 14, borderCurve: "continuous",
            backgroundColor: selected.size === 0 ? colors.surface : colors.primary,
            paddingVertical: 14, alignItems: "center",
          }}
        >
          <Text style={{ color: selected.size === 0 ? colors.textMuted : "#fff", fontSize: 15, fontWeight: "900" }}>
            {tc("ehrAccept")} ({selected.size})
          </Text>
        </Pressable>
      </View>
    </Modal>
  )
}
