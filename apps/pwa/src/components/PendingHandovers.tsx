import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import { colors, withAlpha } from "@/theme/colors"

// Cases a colleague has offered you, waiting for an answer.
//
// Lifted out of the dashboard screen, which had grown past its size budget.
// This is a self-contained thing on that screen — a list, two buttons — and the
// screen does not need to hold its markup to decide what else to draw.

export type PendingTransfer = {
  id: string
  caseId: string
  procedureName?: string
  case?: { preop?: { plannedProcedure?: string; diagnosis?: string } }
  fromUser?: { name?: string }
}

/** What the case is, from whichever of the three fields the API filled in. */
export function transferLabel(item: PendingTransfer): string {
  return item.procedureName
    ?? item.case?.preop?.plannedProcedure
    ?? item.case?.preop?.diagnosis
    ?? "Unknown procedure"
}

type Props = {
  transfers: PendingTransfer[]
  /** The one currently being answered, so only its button shows a spinner. */
  actioning: string | null
  onAction: (item: PendingTransfer, action: "accept" | "decline") => void
  /** Only the keys this list needs; see the note in use-case-handover.ts. */
  t: (key: "pendingHandovers" | "from" | "accept" | "decline") => string
}

export function PendingHandovers({ transfers, actioning, onAction, t }: Props) {
  if (transfers.length === 0) return null

  return (
    <View style={{
      backgroundColor: withAlpha(colors.warning, "18"),
      borderColor: withAlpha(colors.warning, "66"),
      borderWidth: 1, borderRadius: 14, borderCurve: "continuous",
      padding: 14, marginBottom: 14,
    }}>
      <Text style={{ color: colors.warning, fontWeight: "800", fontSize: 14, marginBottom: 10 }}>
        {t("pendingHandovers")}
      </Text>
      {transfers.map(transfer => (
        <View key={transfer.id} style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
            {transferLabel(transfer)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, marginBottom: 8 }}>
            {t("from")} {transfer.fromUser?.name ?? "Unknown user"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
              onPress={() => onAction(transfer, "accept")}
              disabled={actioning === transfer.id}
            >
              {actioning === transfer.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{t("accept")}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.surfacePressed, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
              onPress={() => onAction(transfer, "decline")}
              disabled={actioning === transfer.id}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{t("decline")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  )
}
