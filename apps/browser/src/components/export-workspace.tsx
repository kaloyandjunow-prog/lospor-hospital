"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FilePlus2, RefreshCw } from "lucide-react"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type {
  ResearchExportFormat,
  ResearchExportRecord,
  ResearchMetadata,
  SavedResearchCohort,
} from "@lospor/core/research"
import { apiJson } from "@/lib/client-api"
import { useLocale } from "./locale-provider"
import {
  canDownloadResearchExport,
  canOfferOmopExport,
  researchExportArtifactExpired,
  researchExportsNeedPolling,
} from "@/lib/research-ui-policy"

export function ExportWorkspace() {
  const { locale, message } = useLocale()
  const [metadata, setMetadata] = useState<ResearchMetadata | null>(null)
  const [cohorts, setCohorts] = useState<SavedResearchCohort[]>([])
  const [history, setHistory] = useState<ResearchExportRecord[]>([])
  const [cohortId, setCohortId] = useState("default")
  const [name, setName] = useState("research_export")
  const [format, setFormat] = useState<ResearchExportFormat>("csv")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const selected = useMemo(
    () => cohorts.find(item => item.id === cohortId),
    [cohorts, cohortId],
  )
  const hasPending = useMemo(
    () => researchExportsNeedPolling(history),
    [history],
  )

  async function load(showLoading = true) {
    if (showLoading) setLoading(true)
    setError("")
    try {
      const [meta, saved, exports] = await Promise.all([
        apiJson<ResearchMetadata>("/research/metadata"),
        apiJson<SavedResearchCohort[]>("/research/cohorts"),
        apiJson<ResearchExportRecord[]>("/research/exports"),
      ])
      setMetadata(meta)
      setCohorts(saved)
      setHistory(exports)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load exports")
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([
      apiJson<ResearchMetadata>("/research/metadata"),
      apiJson<SavedResearchCohort[]>("/research/cohorts"),
      apiJson<ResearchExportRecord[]>("/research/exports"),
    ]).then(([meta, saved, exports]) => {
      if (!active) return
      setMetadata(meta)
      setCohorts(saved)
      setHistory(exports)
    }).catch(caught => {
      if (active) setError(caught instanceof Error ? caught.message : "Could not load exports")
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!hasPending) return
    const timer = window.setInterval(() => {
      apiJson<ResearchExportRecord[]>("/research/exports")
        .then(setHistory)
        .catch(caught => {
          setError(caught instanceof Error ? caught.message : "Could not refresh exports")
        })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [hasPending])

  function download(record: ResearchExportRecord) {
    if (!canDownloadResearchExport(record)) return
    const anchor = document.createElement("a")
    anchor.href = `/api/research/exports/${record.id}/download`
    if (record.filename) anchor.download = record.filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  async function create() {
    const definition = selected?.definition ?? {
      version: 1 as const,
      filters: { statuses: ["COMPLETE" as const] },
    }
    setLoading(true)
    setError("")
    try {
      const record = await apiJson<ResearchExportRecord>("/research/exports", {
        method: "POST",
        body: JSON.stringify({ name, format, definition }),
      })
      setHistory(current => [record, ...current])
      setLoading(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export creation failed")
      setLoading(false)
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-header"><h3>{message("createCompleteExport")}</h3></div>
        <div className="panel-body">
          <div className="filter-grid">
            <div className="field">
              <label>{message("cohort")}</label>
              <select className="select" value={cohortId} onChange={e => setCohortId(e.target.value)}>
                <option value="default">{message("allFinalizedCases")}</option>
                {cohorts.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{message("fileName")}</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>{message("format")}</label>
              <select className="select" value={format} onChange={e => setFormat(e.target.value as ResearchExportFormat)}>
                <option value="csv">Research CSV</option>
                <option value="json">Research JSON</option>
                {metadata && canOfferOmopExport(metadata.permissions) && <option value="omop-csv">OMOP multi-table CSV ZIP</option>}
                {metadata && canOfferOmopExport(metadata.permissions) && <option value="omop-json">OMOP JSON</option>}
              </select>
            </div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>{message("exportNotice")}</div>
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
          <div className="toolbar end" style={{ marginTop: 14 }}>
            <button className="button primary" type="button" disabled={loading || !name.trim()} onClick={create}>
              <FilePlus2 size={16} /> {loading ? message("preparing") : message("createDownload")}
            </button>
          </div>
        </div>
        {loading && <div className="loading-line" />}
      </section>
      <section className="panel">
        <div className="panel-header">
          <h3>{message("exportHistory")}</h3>
          <button className="icon-button" type="button" title={message("refresh")} onClick={() => load()}><RefreshCw size={16} /></button>
        </div>
        {!history.length && !loading ? <div className="empty">{message("noExports")}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{message("created")}</th><th>{message("name")}</th><th>{message("format")}</th><th>{message("status")}</th><th>{message("rows")}</th><th>SHA-256</th><th>{message("availableUntil")}</th><th>{message("download")}</th></tr></thead>
              <tbody>{history.map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td><strong>{item.name}</strong>{item.error && <><br /><span className="scope-label">{item.error}</span></>}</td>
                  <td>{clinicalDisplayLabel("exportFormat", item.format, locale)}</td>
                  <td><span className={`pill ${item.status === "COMPLETE" ? "good" : item.status === "FAILED" ? "bad" : "warn"}`}>{clinicalDisplayLabel("exportStatus", item.status, locale)}</span></td>
                  <td className="number">{item.rowCount ?? "—"}</td>
                  <td className="mono">{item.checksum ? `${item.checksum.slice(0, 14)}…` : "—"}</td>
                  <td>{
                    item.status !== "COMPLETE"
                      ? "\u2014"
                      : researchExportArtifactExpired(item)
                        ? <span className="pill bad">{message("artifactExpired")}</span>
                        : !item.artifactAvailable
                          ? <span className="pill warn">{message("artifactUnavailable")}</span>
                          : item.expiresAt
                            ? new Date(item.expiresAt).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB")
                            : "\u2014"
                  }</td>
                  <td>
                    <button
                      className="icon-button"
                      type="button"
                      title={canDownloadResearchExport(item)
                        ? message("download")
                        : researchExportArtifactExpired(item)
                          ? message("artifactExpired")
                          : message("artifactUnavailable")}
                      disabled={loading || !canDownloadResearchExport(item)}
                      onClick={() => download(item)}
                    >
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
