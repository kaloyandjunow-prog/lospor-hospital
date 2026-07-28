import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native"
import { Stack } from "expo-router"
import { ApiError, apiFetch, apiJson } from "@/lib/api"
import { notify, confirmAction } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { ScreenState, WorkflowPill } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"

type Institution = { name?: string; city?: string }
type UserRow = {
  id: string
  email: string
  name?: string
  firstName?: string
  lastName?: string
  title?: string
  role?: string
  createdAt?: string
  institution?: Institution
}
type RoleRequest = {
  id: string
  requestedAt: string
  user: UserRow
}
type AdminListItem =
  | { kind: "pending"; user: UserRow }
  | { kind: "request"; request: RoleRequest }
  | { kind: "user"; user: UserRow }
type Tab = "Registrations" | "HOD Requests" | "Users"

const TABS: Tab[] = ["Registrations", "HOD Requests", "Users"]

function displayName(user: UserRow) {
  return [user.title, user.firstName || user.name, user.lastName].filter(Boolean).join(" ") || user.email
}

function instLabel(inst?: Institution) {
  return [inst?.name, inst?.city].filter(Boolean).join(" - ")
}

export default function AdminScreen() {
  const { t, language } = usePreferences()
  const [tab, setTab] = useState<Tab>("Registrations")
  const [users, setUsers] = useState<UserRow[]>([])
  const [pendingUsers, setPendingUsers] = useState<UserRow[]>([])
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      setError(null)
      const [approved, pending, requests] = await Promise.all([
        apiJson<UserRow[]>("/api/admin/users"),
        apiJson<UserRow[]>("/api/admin/users?pending=true"),
        apiJson<RoleRequest[]>("/api/admin/role-requests"),
      ])
      setForbidden(false)
      setUsers(approved)
      setPendingUsers(pending)
      setRoleRequests(requests)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
        setError(t("adminRequired"))
      } else {
        setError(err instanceof Error ? err.message : "Could not load admin data.")
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  async function request(path: string, init: RequestInit, success: () => void) {
    setActing(path)
    try {
      const res = await apiFetch(path, init)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Action failed")
      }
      success()
    } catch (err) {
      notify(t("error"), err instanceof Error ? err.message : t("actionFailed"))
    } finally {
      setActing(null)
    }
  }

  function approvePending(user: UserRow) {
    request(`/api/admin/users/${user.id}/approve`, { method: "POST" }, () => {
      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id))
      setUsers((prev) => [{ ...user, role: "MEMBER" }, ...prev])
    })
  }

  function rejectPending(user: UserRow) {
    void confirmAction(t("rejectRegistration"), `${t("deleteUserQuestion")} ${displayName(user)}`, { destructive: true, confirmLabel: t("reject"), cancelLabel: t("cancel") })
      .then(ok => {
        if (ok) request(`/api/admin/users/${user.id}`, { method: "DELETE" }, () => {
          setPendingUsers((prev) => prev.filter((u) => u.id !== user.id))
        })
      })
  }

  function handleRoleRequest(req: RoleRequest, action: "approve" | "reject") {
    request(`/api/admin/role-requests/${req.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }, () => {
      setRoleRequests((prev) => prev.filter((r) => r.id !== req.id))
      if (action === "approve") {
        setUsers((prev) => prev.map((u) => u.id === req.user.id ? { ...u, role: "HEAD_OF_DEPT" } : u))
      }
    })
  }

  function changeRole(user: UserRow, role: "MEMBER" | "HEAD_OF_DEPT") {
    request(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }, () => setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role } : u)))
  }

  const data: AdminListItem[] =
    tab === "Registrations" ? pendingUsers.map((user) => ({ kind: "pending" as const, user }))
    : tab === "HOD Requests" ? roleRequests.map((request) => ({ kind: "request" as const, request }))
    : users.map((user) => ({ kind: "user" as const, user }))

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: t("adminConsole") }} />
        <ScreenState title={t("loadingAdmin")} loading />
      </View>
    )
  }

  if (forbidden || error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: t("adminConsole") }} />
        <ScreenState title={forbidden ? t("adminOnly") : t("adminUnavailable")} message={error ?? undefined} action="Retry" onAction={() => load(true)} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: t("adminConsole") }} />
      <FlatList
        data={data}
        keyExtractor={(item) => item.kind === "request" ? item.request.id : item.user.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900" }}>{t("administration")}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3, marginBottom: 12 }}>
              {t("adminSubtitle")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TABS.map((item) => (
                <WorkflowPill
                  key={item}
                  label={item === "Registrations" ? t("registrations") : item === "HOD Requests" ? t("hodRequests") : t("users")}
                  selected={tab === item}
                  onPress={() => setTab(item)}
                />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<ScreenState title={t("nothingPending")} message={tab === "Users" ? t("noApprovedUsers") : t("queueClear")} />}
        renderItem={({ item }) => {
          const user = item.kind === "request" ? item.request.user : item.user
          const rowActing =
            item.kind === "request"
              ? acting?.includes(item.request.id)
              : acting?.includes(user.id)
          return (
            <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "900" }}>{displayName(user)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>{user.email}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{instLabel(user.institution) || t("noInstitution")}</Text>
              {item.kind === "user" ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 6 }}>{displayClinicalCode("userRole", user.role, language)}</Text> : null}
              {item.kind === "request" ? <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "800", marginTop: 6 }}>{t("requested")} {new Date(item.request.requestedAt).toLocaleDateString()}</Text> : null}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                {item.kind === "pending" ? (
                  <>
                    <AdminButton label={t("reject")} color={colors.danger} onPress={() => rejectPending(user)} disabled={!!rowActing} outline />
                    <AdminButton label={t("approve")} color={colors.success} onPress={() => approvePending(user)} disabled={!!rowActing} loading={!!rowActing} />
                  </>
                ) : item.kind === "request" ? (
                  <>
                    <AdminButton label={t("reject")} color={colors.danger} onPress={() => handleRoleRequest(item.request, "reject")} disabled={!!rowActing} outline />
                    <AdminButton label={t("approveHod")} color={colors.success} onPress={() => handleRoleRequest(item.request, "approve")} disabled={!!rowActing} loading={!!rowActing} />
                  </>
                ) : (
                  <>
                    <AdminButton label={t("member")} color={colors.primary} onPress={() => changeRole(user, "MEMBER")} disabled={user.role === "MEMBER" || !!rowActing} outline={user.role !== "MEMBER"} />
                    <AdminButton label={t("hod")} color={colors.warning} onPress={() => changeRole(user, "HEAD_OF_DEPT")} disabled={user.role === "HEAD_OF_DEPT" || !!rowActing} outline={user.role !== "HEAD_OF_DEPT"} />
                  </>
                )}
              </View>
            </View>
          )
        }}
      />
    </View>
  )
}

function AdminButton({ label, color, onPress, disabled, loading, outline }: { label: string; color: string; onPress: () => void; disabled?: boolean; loading?: boolean; outline?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: outline ? withAlpha(color, "14") : color,
        paddingVertical: 11,
        alignItems: "center",
        opacity: disabled ? 0.55 : 1,
        minHeight: 42,
        boxShadow: outline ? undefined : `0 8px 18px ${withAlpha(color, "22")}`,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={outline ? color : colors.background} /> : (
        <Text style={{ color: outline ? color : colors.background, fontSize: 12, fontWeight: "900" }}>{label}</Text>
      )}
    </TouchableOpacity>
  )
}
