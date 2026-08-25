"use client"

import { Fragment, useEffect, useState, type FormEvent } from "react"
import { Copy, ListFilter, Pencil, Play, RefreshCw, Trash2 } from "lucide-react"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type {
  ResearchCaseQueryResponse,
  ResearchMetadata,
  ResearchQueryResponse,
  SavedResearchCohort,
} from "@lospor/core/research"
import { apiJson } from "@/lib/client-api"
import { formatResearchCount } from "@/lib/research-disclosure"
import { canManageSavedCohort, savedCohortPatch } from "@/lib/saved-cohort-policy"
import { CasesTable } from "./cases-table"
import { useLocale } from "./locale-provider"

export function SavedCohorts({
  metadata,
  currentUserId,
  refreshToken,
  onEditDefinition,
}: {
  metadata: ResearchMetadata
  currentUserId: string
  refreshToken: number
  onEditDefinition: (cohort: SavedResearchCohort) => void
}) {
  const { locale, message } = useLocale()
  const [items, setItems] = useState<SavedResearchCohort[]>([])
  const [previewCases, setPreviewCases] = useState<ResearchCaseQueryResponse | null>(null)
  const [preview, setPreview] = useState<ResearchQueryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<SavedResearchCohort | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editVisibility, setEditVisibility] = useState<SavedResearchCohort["visibility"]>("PRIVATE")
  const loadError = message("loadSavedCohortsFailed")

  async function load() {
    setLoading(true)
    setError("")
    try {
      setItems(await apiJson<SavedResearchCohort[]>("/research/cohorts"))
    } catch {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    apiJson<SavedResearchCohort[]>("/research/cohorts")
      .then(rows => { if (active) setItems(rows) })
      .catch(() => { if (active) setError(loadError) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadError, refreshToken])

  async function run(item: SavedResearchCohort) {
    setLoading(true)
    setError("")
    try {
      const request = {
        method: "POST",
        body: JSON.stringify({
          cohort: item.definition,
          savedCohortId: item.id,
          pagination: { take: 10 },
          metrics: ["caseCount", "pediatricRate", "meanAgeYears", "meanAgeDays", "meanDurationMinutes", "complicationRate"],
          distributions: [],
        }),
      }
      const [aggregate, inspected] = await Promise.all([
        apiJson<ResearchQueryResponse>("/research/query", request),
        metadata.permissions.inspectCases
          ? apiJson<ResearchCaseQueryResponse>("/research/cases/query", request)
          : Promise.resolve(null),
      ])
      setPreview(aggregate)
      setPreviewCases(inspected)
    } catch {
      setError(message("cohortRunFailed"))
    } finally {
      setLoading(false)
    }
  }

  async function duplicate(item: SavedResearchCohort) {
    if (!metadata.permissions.savePrivateCohorts) return
    setLoading(true)
    setError("")
    try {
      await apiJson("/research/cohorts", {
        method: "POST",
        body: JSON.stringify({
          name: `${item.name} ${message("copySuffix")}`,
          description: item.description,
          visibility: "PRIVATE",
          definition: item.definition,
        }),
      })
      await load()
    } catch {
      setError(message("duplicateCohortFailed"))
      setLoading(false)
    }
  }

  async function remove(item: SavedResearchCohort) {
    if (!canManageSavedCohort(item, currentUserId, metadata.permissions.savePrivateCohorts)) return
    if (!window.confirm(message("deleteCohortConfirm"))) return
    setLoading(true)
    setError("")
    try {
      await apiJson(`/research/cohorts/${item.id}`, { method: "DELETE" })
      if (editing?.id === item.id) setEditing(null)
      await load()
    } catch {
      setError(message("deleteCohortFailed"))
      setLoading(false)
    }
  }

  function beginEdit(item: SavedResearchCohort) {
    if (!canManageSavedCohort(item, currentUserId, metadata.permissions.savePrivateCohorts)) return
    setEditing(item)
    setEditName(item.name)
    setEditDescription(item.description ?? "")
    setEditVisibility(item.visibility)
    setError("")
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !canManageSavedCohort(editing, currentUserId, metadata.permissions.savePrivateCohorts)) return
    setLoading(true)
    setError("")
    try {
      const patch = savedCohortPatch({
        name: editName,
        description: editDescription,
        visibility: editVisibility,
        originalVisibility: editing.visibility,
      }, metadata.permissions.shareInstitutionCohorts)
      await apiJson(`/research/cohorts/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, expectedUpdatedAt: editing.updatedAt }),
      })
      setEditing(null)
      await load()
    } catch {
      setError(message("updateCohortFailed"))
      setLoading(false)
    }
  }

  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="panel-header">
        <h3>{message("savedCohorts")}</h3>
        <button className="icon-button" type="button" title={message("refresh")} onClick={load}>
          <RefreshCw size={16} />
        </button>
      </div>
      {loading && <div className="loading-line" />}
      {error && <div className="notice error" style={{ margin: 14 }}>{error}</div>}
      {!loading && !items.length && <div className="empty">{message("noSavedCohorts")}</div>}
      {!!items.length && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{message("name")}</th><th>{message("visibility")}</th><th>{message("updated")}</th><th>{message("lastRun")}</th><th>{message("actions")}</th></tr></thead>
            <tbody>
              {items.map(item => {
                const canManage = canManageSavedCohort(
                  item,
                  currentUserId,
                  metadata.permissions.savePrivateCohorts,
                )
                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td><strong>{item.name}</strong><br /><span className="scope-label">{item.description}</span></td>
                      <td><span className={`pill ${item.visibility === "INSTITUTION" ? "info" : ""}`}>{clinicalDisplayLabel("cohortVisibility", item.visibility, locale)}</span></td>
                      <td>{new Date(item.updatedAt).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB")}</td>
                      <td>{item.lastRunAt ? new Date(item.lastRunAt).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB") : "-"}</td>
                      <td>
                        <div className="toolbar">
                          <button className="icon-button" type="button" title={message("run")} onClick={() => run(item)}><Play size={15} /></button>
                          {metadata.permissions.savePrivateCohorts && (
                            <button className="icon-button" type="button" title={message("duplicate")} onClick={() => duplicate(item)}><Copy size={15} /></button>
                          )}
                          {canManage && (
                            <button className="icon-button" type="button" title={message("edit")} onClick={() => beginEdit(item)}><Pencil size={15} /></button>
                          )}
                          {canManage && (
                            <button className="icon-button" type="button" title={message("editCohortFilters")} onClick={() => onEditDefinition(item)}><ListFilter size={15} /></button>
                          )}
                          {canManage && (
                            <button className="icon-button" type="button" title={message("delete")} onClick={() => remove(item)}><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editing?.id === item.id && (
                      <tr>
                        <td colSpan={5}>
                          <form onSubmit={update} aria-label={message("editSavedCohort")}>
                            <div className="filter-grid">
                              <div className="field">
                                <label htmlFor={`cohort-name-${item.id}`}>{message("name")}</label>
                                <input
                                  id={`cohort-name-${item.id}`}
                                  className="input"
                                  maxLength={120}
                                  required
                                  value={editName}
                                  onChange={event => setEditName(event.target.value)}
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`cohort-description-${item.id}`}>{message("description")}</label>
                                <input
                                  id={`cohort-description-${item.id}`}
                                  className="input"
                                  maxLength={500}
                                  value={editDescription}
                                  onChange={event => setEditDescription(event.target.value)}
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`cohort-visibility-${item.id}`}>{message("visibility")}</label>
                                <select
                                  id={`cohort-visibility-${item.id}`}
                                  className="select"
                                  value={editVisibility}
                                  onChange={event => setEditVisibility(event.target.value as SavedResearchCohort["visibility"])}
                                >
                                  <option value="PRIVATE">{message("private")}</option>
                                  {(metadata.permissions.shareInstitutionCohorts || item.visibility === "INSTITUTION") && (
                                    <option value="INSTITUTION">{message("institution")}</option>
                                  )}
                                </select>
                              </div>
                            </div>
                            <div className="toolbar end" style={{ marginTop: 12 }}>
                              <button className="button" type="button" onClick={() => setEditing(null)}>{message("cancel")}</button>
                              <button className="button primary" type="submit" disabled={loading || !editName.trim()}>{message("saveChanges")}</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {preview && (
        <>
          <div className="panel-header">
            <h3>{message("savedPreview")}</h3>
            <span className="pill info">{formatResearchCount(preview.matchingCaseCount)} {message("casesLabel")}</span>
          </div>
          {previewCases
            ? <CasesTable cases={previewCases.cases} />
            : <div className="notice">{message("aggregateOnly")}</div>}
        </>
      )}
    </section>
  )
}
