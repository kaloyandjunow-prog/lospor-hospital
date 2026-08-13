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
}
