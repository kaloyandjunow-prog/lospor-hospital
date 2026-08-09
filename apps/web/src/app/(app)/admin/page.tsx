"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Shield, Users, Clock, Check, X, ScrollText, ChevronLeft, ChevronRight, Download, Building2 } from "lucide-react"
import { useTranslations } from "next-intl"

type UserRow = {
  id: string; email: string; name: string; firstName: string
  lastName: string; title: string; role: string; createdAt: string
  institution: { name: string; city: string }
}

type PendingUser = {
  id: string; email: string; name: string; firstName: string
  lastName: string; title: string; createdAt: string
  institution: { name: string; city: string }
}

type RoleRequest = {
  id: string; requestedAt: string
  user: { id: string; email: string; name: string; firstName: string; lastName: string; title: string; institution: { name: string; city: string } }
}

type InstitutionRequest = {
  id: string; requestedAt: string
  requestedInstitution: { id: string; name: string; city: string }
  user: { id: string; email: string; name: string; role: string }
}

export default function AdminPage() {
  const t = useTranslations()
  const router = useRouter()
  const [users,    setUsers]    = useState<UserRow[]>([])
  const [pending,  setPending]  = useState<PendingUser[]>([])
  const [requests, setRequests] = useState<RoleRequest[]>([])
  const [moveRequests, setMoveRequests] = useState<InstitutionRequest[]>([])
  // A head of department is not an administrator, but does decide who joins
  // their department. They get this page with only that section on it.
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [acting,   setActing]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then(r => r.status === 403 ? null : r.json()),
      fetch("/api/admin/users?pending=true").then(r => r.ok ? r.json() : []),
      fetch("/api/admin/role-requests").then(r => r.ok ? r.json() : []),
      fetch("/api/admin/institution-requests").then(r => r.ok ? r.json() : null),
    ]).then(([users, pend, reqs, moves]) => {
      // Only send someone away if they can see neither list. Previously any
      // 403 on the user list bounced them, which locked heads of department
      // out of the one queue that is theirs to act on.
      if (!users && !moves) { router.replace("/dashboard"); return }
      setIsAdmin(Boolean(users))
      setUsers(users ?? [])
      setPending(pend ?? [])
      setRequests(reqs ?? [])
      setMoveRequests(moves ?? [])
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [router])

  async function handleMoveRequest(id: string, decision: "APPROVE" | "REJECT") {
    setActing(id)
    const res = await fetch(`/api/admin/institution-requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    })
    if (res.ok) setMoveRequests(prev => prev.filter(req => req.id !== id))
    setActing(null)
  }

  async function changeRole(userId: string, role: string) {
    setSaving(userId)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    setSaving(null)
    if (res.ok) setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
  }

  async function approvePending(id: string) {
    setActing(id)
    const res = await fetch(`/api/admin/users/${id}/approve`, { method: "POST" })
    setActing(null)
    if (res.ok) {
      const approved = pending.find(u => u.id === id)
      setPending(prev => prev.filter(u => u.id !== id))
      if (approved) setUsers(prev => [...prev, { ...approved, role: "MEMBER" }])
    }
  }

  async function rejectPending(id: string) {
    setActing(id)
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
    setActing(null)
    if (res.ok) setPending(prev => prev.filter(u => u.id !== id))
  }

  async function handleRequest(id: string, action: "approve" | "reject") {
    setActing(id)
    const res = await fetch(`/api/admin/role-requests/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    setActing(null)
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== id))
      if (action === "approve") {
        const req = requests.find(r => r.id === id)
        if (req) setUsers(prev => prev.map(u => u.id === req.user.id ? { ...u, role: "HEAD_OF_DEPT" } : u))
      }
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    MEMBER: t("admin.roleMember"), HEAD_OF_DEPT: t("admin.roleHOD"), ADMIN: t("admin.roleAdmin"),
    CLINICIAN: t("admin.roleMemberLegacy"), RESEARCHER: t("admin.roleMemberLegacy"),
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("admin.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin.subtitle")}</p>
        </div>
      </div>

      {/* Requests to join a department.
          Shown to administrators and to the head of the department being
          joined — approving is what admits someone and lets that head see
          their cases, so it is the receiving department that decides. */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-blue-100 dark:border-blue-900/40 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/10">
          <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
            {t("admin.institutionRequests")} {!loading && `(${moveRequests.length})`}
          </span>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
        ) : moveRequests.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">{t("admin.noInstitutionRequests")}</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
            {moveRequests.map(req => (
              <div key={req.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {req.user.name || req.user.email}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {t("admin.wantsToJoin")} {req.requestedInstitution.name}
                    {req.requestedInstitution.city ? ` · ${req.requestedInstitution.city}` : ""}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t("admin.requested")} {new Date(req.requestedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleMoveRequest(req.id, "REJECT")}
                    disabled={acting === req.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-[#3a3a3a] px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                  </button>
                  <button
                    onClick={() => handleMoveRequest(req.id, "APPROVE")}
                    disabled={acting === req.id}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Everything below is administrator-only. A head of department sees the
          institution queue above and nothing else. */}
      {!isAdmin ? null : <>

      {/* Pending registrations */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-red-100 dark:border-red-900/40 flex items-center gap-2 bg-red-50 dark:bg-red-900/10">
          <Clock className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="text-sm font-semibold text-red-800 dark:text-red-300">
            {t("admin.pendingRegistrations")} {!loading && `(${pending.length})`}
          </span>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
        ) : pending.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">{t("admin.noPendingRegistrations")}</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
            {pending.map(u => {
              const displayName = [u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ")
              return (
                <div key={u.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{displayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {u.institution?.name ?? "—"} — {u.institution?.city ?? "—"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {t("admin.registered")} {new Date(u.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => rejectPending(u.id)} disabled={acting === u.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                      <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                    </button>
                    <button onClick={() => approvePending(u.id)} disabled={acting === u.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors">
                      <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending role requests */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-900/40 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {t("admin.hodRequests")} {!loading && `(${requests.length})`}
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">{t("admin.noPendingRequests")}</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
            {requests.map(req => {
              const u = req.user
              const displayName = [u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ")
              return (
                <div key={req.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{displayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {u.institution?.name ?? "—"} — {u.institution?.city ?? "—"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {t("admin.requested")} {new Date(req.requestedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleRequest(req.id, "reject")} disabled={acting === req.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                      <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                    </button>
                    <button onClick={() => handleRequest(req.id, "approve")} disabled={acting === req.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors">
                      <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* All users */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("admin.allUsers")} {!loading && `(${users.length})`}
          </span>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-[#161616] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  {[t("admin.colName"), t("admin.colEmail"), t("admin.colInstitution"), t("admin.colRole"), t("admin.colJoined")].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {[u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ")}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {u.institution?.name ?? "—"}
                      {u.institution?.city && <span className="text-slate-400 ml-1 text-xs">({u.institution.city})</span>}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "ADMIN" ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{t("admin.roleAdmin")}</span>
                      ) : (
                        <select value={u.role === "CLINICIAN" || u.role === "RESEARCHER" ? "MEMBER" : u.role}
                          disabled={saving === u.id}
                          onChange={e => changeRole(u.id, e.target.value)}
                          className="text-xs rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                          {["MEMBER", "HEAD_OF_DEPT"].map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString(undefined)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-400 dark:text-slate-500">
        <p><strong>{t("admin.roleMember")}</strong> — {t("admin.legendMember")}</p>
        <p><strong>{t("admin.roleHOD")}</strong> — {t("admin.legendHOD")}</p>
        <p><strong>{t("admin.roleAdmin")}</strong> — {t("admin.legendAdmin")}</p>
      </div>

      <AuditLogSection />
      </>}
    </div>
  )
}

type AuditRow = {
  id: string; createdAt: string; action: string; entityId: string; detail: unknown
  user: { name?: string; firstName?: string; lastName?: string; title?: string }
}

const ACTION_OPTIONS = ["", "CASE_CREATE", "CASE_UPDATE", "CASE_DELETE", "AI_ADVISE"]

function AuditLogSection() {
  const t = useTranslations()
  const [logs,    setLogs]    = useState<AuditRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [action,  setAction]  = useState("")
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  const ACTION_LABELS: Record<string, string> = {
    "": t("admin.allActions"), CASE_CREATE: t("admin.actionCaseCreate"),
    CASE_UPDATE: t("admin.actionCaseUpdate"), CASE_DELETE: t("admin.actionCaseDelete"),
    AI_ADVISE: t("admin.actionAiAdvise"),
  }

  async function load(p = page, a = action) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), ...(a ? { action: a } : {}) })
    const res = await fetch(`/api/admin/audit-logs?${params}`)
    const data = await res.json()
    setLogs(data.logs ?? [])
    setTotal(data.total ?? 0)
    setPage(p)
    setAction(a)
    setLoaded(true)
    setLoading(false)
  }

  function userName(u: AuditRow["user"]) {
    return [u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ") || "—"
  }

  const pageSize = 50
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("admin.auditLog")} {loaded && `(${total})`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={action} onChange={e => load(0, e.target.value)}
            className="text-xs rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ACTION_OPTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
          {!loaded && (
            <button onClick={() => load(0)}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#2a2a2a] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] transition-colors">
              {t("admin.load")}
            </button>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="py-10 text-center text-slate-400 text-sm">{t("admin.clickToLoad")}</div>
      ) : loading ? (
        <div className="py-10 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
      ) : logs.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">{t("admin.noEntries")}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-[#161616] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  {[t("admin.colTime"), t("admin.colUser"), t("admin.colAction"), t("admin.colEntityId"), t("admin.colDetail")].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 text-xs">{userName(l.user)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        l.action === "CASE_DELETE" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        l.action === "AI_ADVISE"   ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                        "bg-slate-100 text-slate-600 dark:bg-[#2a2a2a] dark:text-slate-400"
                      }`}>{l.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{l.entityId.slice(0, 12)}…</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs max-w-xs truncate">
                      {l.detail ? JSON.stringify(l.detail).slice(0, 80) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-[#2a2a2a] flex items-center justify-between text-xs text-slate-500">
              <span>{t("admin.pageOf", { page: page + 1, total: totalPages })}</span>
              <div className="flex gap-2">
                <button onClick={() => load(page - 1)} disabled={page === 0}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Research export ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center gap-2">
          <Download className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("admin.researchExport")}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Export all finalised cases as an OMOP CDM v5.4 bundle. All person identifiers are replaced with deterministic pseudonymised case-level hashes. Suitable for observational research and OHDSI tooling.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/export/omop?format=json"
              download
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export JSON
            </a>
            <a
              href="/api/export/omop?format=csv"
              download
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-slate-50 dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#3a3a3a] hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
