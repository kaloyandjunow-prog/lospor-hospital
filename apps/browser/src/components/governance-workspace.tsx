"use client"

import { useEffect, useState } from "react"
import { Plus, RefreshCw, ShieldX } from "lucide-react"
import { apiJson } from "@/lib/client-api"
import { useLocale } from "./locale-provider"

type User = { id: string; name: string; email: string; role: string }
type Institution = { id: string; name: string }
type Grant = {
  id: string
  userId: string
  institutionId: string | null
  allInstitutions: boolean
  canInspectCases: boolean
  canExport: boolean
  canExportOmop: boolean
  expiresAt: string | null
  revokedAt: string | null
  user: User
  institution: Institution | null
  grantedBy?: { name: string }
}

export function GovernanceWorkspace() {
  const { message } = useLocale()
  const [users, setUsers] = useState<User[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [userId, setUserId] = useState("")
  const [institutionId, setInstitutionId] = useState("")
  const [allInstitutions, setAllInstitutions] = useState(false)
  const [inspect, setInspect] = useState(true)
  const [canExport, setCanExport] = useState(false)
  const [canExportOmop, setCanExportOmop] = useState(false)
  const [expiresAt, setExpiresAt] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const [userRows, institutionRows, grantRows] = await Promise.all([
        apiJson<User[]>("/admin/users"),
        apiJson<Institution[]>("/institutions"),
        apiJson<Grant[]>("/research/grants"),
      ])
      setUsers(userRows.filter(user => user.role === "RESEARCHER"))
      setInstitutions(institutionRows)
      setGrants(grantRows)
      if (!userId) setUserId(userRows.find(user => user.role === "RESEARCHER")?.id ?? "")
      if (!institutionId) setInstitutionId(institutionRows[0]?.id ?? "")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load governance data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([
      apiJson<User[]>("/admin/users"),
      apiJson<Institution[]>("/institutions"),
      apiJson<Grant[]>("/research/grants"),
    ]).then(([userRows, institutionRows, grantRows]) => {
      if (!active) return
      const researchers = userRows.filter(user => user.role === "RESEARCHER")
      setUsers(researchers)
      setInstitutions(institutionRows)
      setGrants(grantRows)
      setUserId(researchers[0]?.id ?? "")
      setInstitutionId(institutionRows[0]?.id ?? "")
    }).catch(caught => {
      if (active) setError(caught instanceof Error ? caught.message : "Could not load governance data")
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function create() {
    setLoading(true)
    setError("")
    try {
      await apiJson("/research/grants", {
        method: "POST",
        body: JSON.stringify({
          userId,
          institutionId: allInstitutions ? null : institutionId,
          allInstitutions,
          canInspectCases: inspect,
          canExport,
          canExportOmop,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
        }),
      })
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Grant creation failed")
      setLoading(false)
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this research grant?")) return
    await apiJson(`/research/grants/${id}`, { method: "DELETE" })
    await load()
  }

  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-header"><h3>{message("grantAccess")}</h3></div>
        <div className="panel-body">
          {!users.length && (
            <div className="notice">
              No accounts currently have the RESEARCHER role. Assign that role in the
              LOSPOR administration console before creating a scope grant.
            </div>
          )}
          <div className="filter-grid" style={{ marginTop: users.length ? 0 : 12 }}>
            <div className="field">
              <label>{message("researcher")}</label>
              <select className="select" value={userId} onChange={e => setUserId(e.target.value)}>
                {users.map(user => <option value={user.id} key={user.id}>{user.name} · {user.email}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{message("institution")}</label>
              <select className="select" disabled={allInstitutions} value={institutionId} onChange={e => setInstitutionId(e.target.value)}>
                {institutions.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{message("expires")}</label>
              <input className="input" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 14 }}>
            <Check label={message("allInstitutions")} checked={allInstitutions} onChange={setAllInstitutions} />
            <Check label={message("inspectCases")} checked={inspect} onChange={setInspect} />
            <Check label={message("exportResearch")} checked={canExport} onChange={setCanExport} />
            <Check label={message("exportOmop")} checked={canExportOmop} onChange={setCanExportOmop} />
          </div>
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
          <div className="toolbar end" style={{ marginTop: 14 }}>
            <button className="button primary" type="button" onClick={create} disabled={loading || !userId || (!allInstitutions && !institutionId)}>
              <Plus size={16} /> {message("createGrant")}
            </button>
          </div>
        </div>
        {loading && <div className="loading-line" />}
      </section>
      <section className="panel">
        <div className="panel-header">
          <h3>{message("researchGrants")}</h3>
          <button className="icon-button" type="button" title={message("refresh")} onClick={load}><RefreshCw size={16} /></button>
        </div>
        {!grants.length && !loading ? <div className="empty">{message("noGrants")}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{message("researcher")}</th><th>{message("scope")}</th><th>{message("permissions")}</th><th>{message("expires")}</th><th>{message("status")}</th><th>{message("action")}</th></tr></thead>
              <tbody>{grants.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.user.name}</strong><br /><span className="scope-label">{item.user.email}</span></td>
                  <td>{item.allInstitutions ? message("allInstitutions") : item.institution?.name ?? "—"}</td>
                  <td>{[
                    item.canInspectCases ? "case inspection" : null,
                    item.canExport ? "exports" : null,
                    item.canExportOmop ? "OMOP" : null,
                  ].filter(Boolean).join(", ")}</td>
                  <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : message("noExpiry")}</td>
                  <td><span className={`pill ${item.revokedAt ? "bad" : "good"}`}>{item.revokedAt ? message("revoked") : message("active")}</span></td>
                  <td><button className="icon-button" type="button" title={message("revoke")} disabled={!!item.revokedAt} onClick={() => revoke(item.id)}><ShieldX size={16} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="pill">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
