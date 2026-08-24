"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Shield, Clock, Check, X, Building2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { AdminAccountTable, type AdminAccount } from "@/components/admin/AdminAccountTable"
import { AuditLogSection } from "@/components/admin/AuditLogSection"

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
  const [users,    setUsers]    = useState<AdminAccount[]>([])
  const [pending,  setPending]  = useState<PendingUser[]>([])
  const [requests, setRequests] = useState<RoleRequest[]>([])
  const [moveRequests, setMoveRequests] = useState<InstitutionRequest[]>([])
  // A head of department is not an administrator, but does decide who joins
  // their department. They get this page with only that section on it.
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState<string | null>(null)

  async function refreshUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" })
    if (response.ok) setUsers(await response.json())
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then(r => r.status === 403 ? null : r.json()),
      fetch("/api/admin/users?pending=true").then(r => r.ok ? r.json() : []),
      fetch("/api/admin/role-requests").then(r => r.ok ? r.json() : []),
      fetch("/api/admin/institution-requests").then(r => r.ok ? r.json() : null),
      fetch("/api/user", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
    ]).then(([users, pend, reqs, moves, current]) => {
      // Only send someone away if they can see neither list. Previously any
      // 403 on the user list bounced them, which locked heads of department
      // out of the one queue that is theirs to act on.
      if (!users && !moves) { router.replace("/dashboard"); return }
      setIsAdmin(Boolean(users))
      setUsers(users ?? [])
      setPending(pend ?? [])
      setRequests(reqs ?? [])
      setMoveRequests(moves ?? [])
      setCurrentUserId(current?.id ?? null)
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

  async function approvePending(id: string) {
    setActing(id)
    const res = await fetch(`/api/admin/users/${id}/approve`, { method: "POST" })
    setActing(null)
    if (res.ok) {
      setPending(prev => prev.filter(u => u.id !== id))
      await refreshUsers()
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
        await refreshUsers()
      }
    }
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

      <AdminAccountTable
        accounts={users}
        loading={loading}
        currentUserId={currentUserId}
        onRefresh={refreshUsers}
      />

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
