"use client"

import type { ResearchMetadata } from "@lospor/core/research"
import { formatResearchScope } from "@/lib/research-scope"
import { useLocale } from "./locale-provider"

export function GovernanceWorkspace({ metadata }: { metadata: ResearchMetadata }) {
  const { message } = useLocale()
  const permissions = [
    ["permissionQuery", metadata.permissions.query],
    ["permissionInspect", metadata.permissions.inspectCases],
    ["permissionCompare", metadata.permissions.compare],
    ["permissionBenchmark", metadata.permissions.benchmark],
    ["permissionPrivateCohorts", metadata.permissions.savePrivateCohorts],
    ["permissionInstitutionCohorts", metadata.permissions.shareInstitutionCohorts],
    ["permissionExport", metadata.permissions.export],
    ["permissionOmop", metadata.permissions.exportOmop],
  ] as const
  const scopes = [
    ["queryScope", metadata.scopes.query],
    ["inspectionScope", metadata.scopes.inspectCases],
    ["exportScope", metadata.scopes.export],
  ] as const

  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-header"><h3>{message("effectiveAccess")}</h3></div>
        <div className="table-wrap">
          <table>
            <tbody>
              {permissions.map(([label, enabled]) => (
                <tr key={label}>
                  <td>{message(label)}</td>
                  <td className="number">
                    <span className={`pill ${enabled ? "good" : "warn"}`}>
                      {enabled ? message("allowed") : message("notAllowed")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h3>{message("scope")}</h3></div>
        <div className="table-wrap">
          <table>
            <tbody>
              {scopes.map(([label, scope]) => (
                <tr key={label}>
                  <td>{message(label)}</td>
                  <td className="number">
                    {formatResearchScope(scope, message("allInstitutions"))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="notice">{message("accessManagedExternally")}</div>
    </div>
  )
}
