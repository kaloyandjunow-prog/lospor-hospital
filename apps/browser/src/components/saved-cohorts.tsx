"use client"

import { useEffect, useState } from "react"
import { Copy, Play, RefreshCw, Trash2 } from "lucide-react"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type {
  ResearchCaseQueryResponse,
  ResearchMetadata,
  ResearchQueryResponse,
  SavedResearchCohort,
} from "@lospor/core/research"
import { apiJson } from "@/lib/client-api"
import { formatResearchCount } from "@/lib/research-disclosure"
import { CasesTable } from "./cases-table"
import { useLocale } from "./locale-provider"

export function SavedCohorts({ metadata }: { metadata: ResearchMetadata }) {
  const { locale, message } = useLocale()
  const [items, setItems] = useState<SavedResearchCohort[]>([])
  const [previewCases, setPreviewCases] = useState<ResearchCaseQueryResponse | null>(null)
  const [preview, setPreview] = useState<ResearchQueryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      setItems(await apiJson<SavedResearchCohort[]>("/research/cohorts"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load saved cohorts")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    apiJson<SavedResearchCohort[]>("/research/cohorts")
      .then(rows => { if (active) setItems(rows) })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : "Could not load saved cohorts") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

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
          metrics: ["caseCount", "meanAgeYears", "meanDurationMinutes", "complicationRate"],
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cohort run failed")
    } finally {
      setLoading(false)
    }
  }

  async function duplicate(item: SavedResearchCohort) {
    await apiJson("/research/cohorts", {
      method: "POST",
      body: JSON.stringify({
        name: `${item.name} copy`,
        description: item.description,
        visibility: "PRIVATE",
        definition: item.definition,
      }),
    })
    await load()
  }

  async function remove(item: SavedResearchCohort) {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    await apiJson(`/research/cohorts/${item.id}`, { method: "DELETE" })
    await load()
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
              {items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><br /><span className="scope-label">{item.description}</span></td>
                  <td><span className={`pill ${item.visibility === "INSTITUTION" ? "info" : ""}`}>{clinicalDisplayLabel("cohortVisibility", item.visibility, locale)}</span></td>
                  <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                  <td>{item.lastRunAt ? new Date(item.lastRunAt).toLocaleDateString() : "-"}</td>
                  <td>
                    <div className="toolbar">
                      <button className="icon-button" type="button" title={message("run")} onClick={() => run(item)}><Play size={15} /></button>
                      <button className="icon-button" type="button" title={message("duplicate")} onClick={() => duplicate(item)}><Copy size={15} /></button>
                      {item.ownerId && (
                        <button className="icon-button" type="button" title={message("delete")} onClick={() => remove(item)}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
