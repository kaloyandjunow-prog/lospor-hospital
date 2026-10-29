import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { displayClinicalCode } from "@/lib/clinical-display"
import { CANCELLATION_REASONS, type CancellationReason } from "@lospor/core/case-cancellation"
import { dashboardMenuActions } from "@/lib/case-actions"
import { colors, withAlpha } from "@/theme/colors"
import type { ClinicalStringKey, TranslationKey } from "@/lib/preferences-context"

type MenuCase = { caseCode: string; theatre?: { id: string | null; name: string | null } | null }
type MenuMode = "menu" | "assign" | "theatre" | "cancel" | "confirmDelete"
type MenuActions = ReturnType<typeof dashboardMenuActions>

export function DashboardCaseMenu({ menuCase, menuMode, menuActions, caseLabel, language, t, tc, closeMenu, setMenuMode, actionLoading, handoverBusy, loadingColleagues, colleagues, onPrint, onDelete, onShowAssign, onAssignTo, onWithdraw, onCancelProcedure, onUndoCancellation, onAssignTheatre, onConfirmDelete, cancelReason, setCancelReason, cancelNote, setCancelNote, theatres }: {
  menuCase: (MenuCase & { id: string }) | null
  menuMode: MenuMode
  menuActions: MenuActions
  caseLabel: string
  language: "en" | "bg"
  t: (key: TranslationKey) => string
  tc: (key: ClinicalStringKey) => string
  closeMenu: () => void
  setMenuMode: (mode: MenuMode) => void
  actionLoading: boolean
  handoverBusy: boolean
  loadingColleagues: boolean
  colleagues: { id: string; name: string; role?: string }[]
  onPrint: () => void
  onDelete: () => void
  onShowAssign: () => void
  onAssignTo: (id: string) => void
  onWithdraw: () => void
  onCancelProcedure: () => void
  onUndoCancellation: () => void
  onAssignTheatre: (id: string | null) => void
  onConfirmDelete: () => void
  cancelReason: CancellationReason | null
  setCancelReason: (reason: CancellationReason | null) => void
  cancelNote: string
  setCancelNote: (note: string) => void
  theatres: { id: string; name: string }[]
}) {
  return <Modal visible={menuCase !== null} transparent animationType="fade" onRequestClose={closeMenu}>
    <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} onPress={closeMenu} activeOpacity={1}>
      <View style={{ backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} onStartShouldSetResponder={() => true}>
        <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />
        {menuMode === "menu" ? <>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 2 }} numberOfLines={2}>{caseLabel}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 18 }}>{menuCase?.caseCode ?? ""}</Text>
          {menuActions.print ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }} onPress={onPrint} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>🖨 {tc("actionPrintCase")}</Text></TouchableOpacity> : null}
          {menuActions.cancel === "available" ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" }} onPress={() => { setCancelReason(null); setCancelNote(""); setMenuMode("cancel") }} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.warning, fontSize: 16, fontWeight: "700" }}>{t("cancelProcedure")}…</Text><Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text></TouchableOpacity> : menuActions.cancel === "inactive" ? <View testID="cancel-procedure-inactive" accessibilityRole="button" accessibilityState={{ disabled: true }} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, opacity: 0.45 }}><Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: "700" }}>{t("cancelProcedure")}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{t("cancellationTooLate")}</Text></View> : null}
          {menuActions.undoCancel ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }} onPress={onUndoCancellation} disabled={actionLoading}><Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{t("undoCancellation")}</Text></TouchableOpacity> : null}
          {menuActions.remove ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }} onPress={onDelete} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.danger, fontSize: 16, fontWeight: "700" }}>{t("deleteCase")}</Text></TouchableOpacity> : null}
          {menuActions.theatre ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" }} onPress={() => setMenuMode("theatre")} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{t("assignTheatre")}…</Text><Text style={{ color: colors.textMuted, fontSize: 14 }} numberOfLines={1}>{menuCase?.theatre?.name ?? ""} ›</Text></TouchableOpacity> : null}
          {menuActions.handOver ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" }} onPress={onShowAssign} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{t("handOver")}…</Text><Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text></TouchableOpacity> : null}
          {menuActions.withdrawHandover ? <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }} onPress={onWithdraw} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{t("withdrawHandover")}</Text></TouchableOpacity> : null}
          <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" }} onPress={closeMenu}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("cancel")}</Text></TouchableOpacity>
        </> : menuMode === "assign" ? <>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 16 }}>{t("assignTo")}</Text>
          {loadingColleagues ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : colleagues.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 16 }}>{t("noColleaguesFound")}</Text> : <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>{colleagues.map(colleague => <TouchableOpacity key={colleague.id} style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} onPress={() => onAssignTo(colleague.id)} disabled={actionLoading || handoverBusy}><View><Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>{colleague.name}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{displayClinicalCode("userRole", colleague.role, language)}</Text></View>{actionLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}</TouchableOpacity>)}</ScrollView>}
          <TouchableOpacity style={{ paddingVertical: 16, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" }} onPress={() => setMenuMode("menu")}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("back")}</Text></TouchableOpacity>
        </> : menuMode === "cancel" ? <>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 4 }}>{t("cancelProcedureTitle")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>{t("cancelProcedureExplain")}</Text>
          <ScrollView testID="cancel-sheet" style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">{CANCELLATION_REASONS.map(item => { const chosen = cancelReason === item.code; return <TouchableOpacity key={item.code} accessibilityRole="radio" accessibilityState={{ selected: chosen }} style={{ paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" }} onPress={() => setCancelReason(item.code)}><Text style={{ color: chosen ? colors.primary : colors.textPrimary, fontSize: 15, fontWeight: chosen ? "800" : "600" }}>{language === "bg" ? item.labelBg : item.labelEn}</Text>{chosen ? <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>✓</Text> : null}</TouchableOpacity> })}<TextInput value={cancelNote} onChangeText={setCancelNote} maxLength={500} placeholder={cancelReason === "OTHER" ? t("cancellationNoteRequired") : t("cancellationNote")} placeholderTextColor={colors.textMuted} style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 10 }} /></ScrollView>
          <TouchableOpacity testID="cancel-confirm" style={{ paddingVertical: 15, marginTop: 12, borderRadius: 12, alignItems: "center", backgroundColor: withAlpha(colors.warning, "22"), borderWidth: 1, borderColor: withAlpha(colors.warning, "66"), opacity: !cancelReason || (cancelReason === "OTHER" && !cancelNote.trim()) ? 0.5 : 1 }} onPress={onCancelProcedure} disabled={actionLoading || !cancelReason || (cancelReason === "OTHER" && !cancelNote.trim())}>{actionLoading ? <ActivityIndicator color={colors.warning} /> : <Text style={{ color: colors.warning, fontSize: 16, fontWeight: "800" }}>{t("confirmCancelProcedure")}</Text>}</TouchableOpacity>
          <TouchableOpacity style={{ paddingVertical: 14, alignItems: "center" }} onPress={() => setMenuMode("menu")}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("back")}</Text></TouchableOpacity>
        </> : menuMode === "theatre" ? <>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 4 }}>{t("theatreLabel")}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>{t("theatreChangeableNote")}</Text>
          <ScrollView testID="theatre-sheet" style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>{theatres.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 16 }}>{t("noTheatresConfigured")}</Text> : null}{[...theatres, ...(menuCase?.theatre?.id ? [{ id: "", name: t("noTheatre") }] : [])].map(item => { const current = (menuCase?.theatre?.id ?? "") === item.id; return <TouchableOpacity key={item.id || "none"} accessibilityRole="button" style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" }} onPress={() => onAssignTheatre(item.id || null)} disabled={actionLoading}><Text style={{ color: current ? colors.primary : colors.textPrimary, fontSize: 15, fontWeight: current ? "800" : "600", fontStyle: item.id ? "normal" : "italic" }}>{item.name}</Text>{current ? <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>✓</Text> : null}</TouchableOpacity> })}</ScrollView>
          {actionLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}<TouchableOpacity style={{ paddingVertical: 16, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" }} onPress={() => setMenuMode("menu")}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("back")}</Text></TouchableOpacity>
        </> : <>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 6 }}>{t("deleteCaseTitle")}</Text><Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }} numberOfLines={2}>{caseLabel}</Text>
          <TouchableOpacity style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center", backgroundColor: "rgba(220,38,38,0.08)", borderRadius: 10, marginBottom: 8 }} onPress={onConfirmDelete} disabled={actionLoading || handoverBusy}>{actionLoading ? <ActivityIndicator color={colors.danger} /> : <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "700" }}>{t("deleteCase")}</Text>}</TouchableOpacity>
          <TouchableOpacity style={{ paddingVertical: 14, alignItems: "center" }} onPress={() => setMenuMode("menu")} disabled={actionLoading || handoverBusy}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("cancel")}</Text></TouchableOpacity>
        </>}
      </View>
    </TouchableOpacity>
  </Modal>
}
