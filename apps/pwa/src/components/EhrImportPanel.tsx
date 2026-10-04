import { useMemo, useState } from "react"
import { Modal, Pressable, ScrollView, Text, View } from "react-native"
import { applyEhrSelections } from "@lospor/core/ehr-import-apply"
import { describeEhrReviewItem } from "@lospor/core/ehr-import-display"
import { visibleReviewItems, type EhrReviewItem, type EhrReviewPlan } from "@lospor/core/ehr-import-review"
import type { EhrUnreadSource } from "@lospor/core/ehr-import-transport"
import type { ClinicalMode } from "@lospor/core/pediatric"
import { notify } from "@/lib/notify"
import { colors, withAlpha, useShade } from "@/theme/colors"
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
  /** The mode the case is in now; an accepted age may change it. */
  currentClinicalMode?: ClinicalMode | null
  /**
   * Whether this deployment can switch the case's mode. False where there is
   * no paediatric mode: an age that would need it is then left out.
   */
  modeChangeAvailable?: boolean
  /** Field labels come from wherever the form already keeps them. */
  labelFor: (field: string) => string
  /**
   * `modeChange`, when set, is the mode the accepted age puts the case in. The
   * host runs its own mode switch first, with the clearing it always does,
   * and writes `patch` after it, so the switch never wipes an imported value.
   */
  onAccept: (
    patch: Record<string, unknown>,
    appliedKeys: string[],
    modeChange: ClinicalMode | null,
  ) => void
  /** Remembered by the server so the item is never offered again. */
  onDecline: (itemKey: string) => void
  /**
   * Take the clinician to the mode control. Only reached from a plan built
   * by an appliance older than 9.13.9, which still holds an age back until
   * the mode is switched by hand.
   */
  onRequestModeChange?: () => void
  onClose: () => void
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
  plan, identityUnverified, unreadSources = [], current, currentClinicalMode,
  modeChangeAvailable = true, labelFor, onAccept, onDecline, onRequestModeChange, onClose,
}: Props) {
  const shade = useShade()
  const { tc, language } = usePreferences()
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

  // What "Add selected" would do, worked out the same way it will be done, so
  // the clinician sees a mode switch (and what it clears) before causing it.
  const preview = applyEhrSelections({
    plan, selectedKeys: selected, current, currentClinicalMode,
    allowModeChange: modeChangeAvailable,
  })
  const ageLeftOut = preview.refused.some(refusal => refusal.reason === "needs-mode-decision")
  const modeNotice = preview.modeChange === "PEDIATRIC" ? tc("ehrModeSwitchToPediatric")
    : preview.modeChange === "ADULT" ? tc("ehrModeSwitchToAdult")
    : ageLeftOut ? tc("ehrModeUnavailable")
    : null

  function accept() {
    onAccept(preview.patch, preview.appliedKeys, preview.modeChange)
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

        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: modeNotice ? 190 : 90 }}>
          {shown.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 32 }}>
              {tc("ehrNothingToReview")}
            </Text>
          ) : shown.map(item => {
            const isSelected = selected.has(item.itemKey)
            const blocked = item.state === "needs-mode-decision"
            const { title, detail } = describeEhrReviewItem(item, {
              locale: language === "bg" ? "bg" : "en", undatedLabel: tc("ehrUndated"), takenLabel: tc("ehrTakenAt"),
            })
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

        <View style={{ position: "absolute", left: 16, right: 16, bottom: 22, gap: 8 }}>
          {modeNotice ? (
            <View
              accessibilityRole="alert"
              style={{
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.warning,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
                {modeNotice}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={accept}
            disabled={selected.size === 0}
            style={{
              borderRadius: 14, borderCurve: "continuous",
              backgroundColor: selected.size === 0 ? colors.surface : colors.primary,
              paddingVertical: 14, alignItems: "center",
            }}
          >
            <Text style={{ color: selected.size === 0 ? colors.textMuted : shade("#fff"), fontSize: 15, fontWeight: "900" }}>
              {tc("ehrAccept")} ({selected.size})
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
