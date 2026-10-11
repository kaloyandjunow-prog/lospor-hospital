export type ComponentGroup = "clinical" | "research" | "safety"

export type ComponentStatus =
  | "operational"
  | "degraded"
  | "outage"
  | "unknown"
  | "not-configured"

export type CheckObservation = {
  component: string
  label: string
  group: ComponentGroup
  status: ComponentStatus
  code: string
  checkedAt: number
  latencyMs?: number
}

export type ComponentView = CheckObservation & {
  observedStatus: ComponentStatus
  changedAt: number
}

export type IncidentView = {
  id: string
  component: string
  label: string
  openedAt: number
  resolvedAt: number | null
  openingStatus: ComponentStatus
  code: string
}

export type OperationalEventView = {
  id: string
  producer: string
  occurredAt: number
  code: string
  severity: "info" | "warning" | "critical"
  message: string
}

export type DayStatus = {
  day: string
  status: ComponentStatus
}

export type DashboardData = {
  components: ComponentView[]
  incidents: IncidentView[]
  events: OperationalEventView[]
  histories: Record<string, DayStatus[]>
  lastCheckedAt: number | null
  snapshot: ApplianceSnapshot | null
  snapshotReceivedAt: number | null
}

export type ApplianceSnapshot = {
  schemaVersion: 1
  generatedAt: string
  versions: {
    hospital?: string
    api?: string
    core?: string
    databaseSchema?: string
  }
  operatorCredentialGeneration: number
  operatorCredentialIdentityProof: string | null
  email: { configured: boolean }
  database: {
    logicalSize: { state: "known" | "unknown"; bytes?: string }
    migrations: {
      state: "ok" | "failed" | "unknown"
      appliedCount?: number
      failedCount?: number
      latestFinishedAt?: string | null
    }
  }
  research: {
    exportsByStatus: Record<string, number>
    storage: {
      driver: "filesystem" | "s3" | "unknown"
      state: "known" | "unknown"
      totalBytes?: string
      availableBytes?: string
    }
  }
  central: {
    configured: boolean
    enrolled: boolean
    exportPolicyApproved: boolean
    casesWithUnacceptedChanges: number
    deliveriesByStatus: Record<string, number>
    enrolledAt: string | null
    lastCapabilitiesAt: string | null
    lastDeliveryAt: string | null
  }
  /** Totals only, for the overview (1.5.4). Absent from an older API. */
  activity?: {
    activeUsers: number
    activeClinical: number
    activeResearch: number
    days: { day: string; started: number; finalized: number }[]
  }
  integrations?: {
    ehr: {
      configured: boolean
      lastReceivedAt: string | null
      /** Imports in the last 24 hours with a group the hospital system did not serve (1.5.6). */
      readFailures24h?: number
      /** Codes that arrived and are mapped to nothing, so their values are not imported (1.5.6). */
      unmappedCodes?: number
    }
    ai: {
      enabled: boolean
      /** The last hourly check of the Mistral key (1.5.6). Absent when AI is off or from an older API. */
      check?: { state: "ok" | "key-refused" | "unreachable"; checkedAt: string }
    }
  }
  /** When the oldest case still waiting for Central started waiting (1.5.6). */
  centralOldestWaitingSince?: string | null
  /** Research exports that failed in the last seven days (1.5.6). */
  researchExportsFailed7d?: number
  /** When someone was last made an administrator, within the last week (1.5.6). Totals and times only. */
  lastAdministratorAddedAt?: string | null
}
