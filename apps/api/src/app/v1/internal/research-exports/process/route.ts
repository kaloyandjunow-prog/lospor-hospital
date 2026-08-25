import { NextResponse } from "next/server"
import { cleanupResearchExportArtifacts, processResearchExport } from "@/lib/research/exports"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import { bearerMatchesAnySecret, configuredSecretOverlap } from "@/lib/rotating-secret"

function configuredSecrets(): string[] {
  return configuredSecretOverlap(
    process.env.RESEARCH_EXPORT_WORKER_SECRET,
    process.env.RESEARCH_EXPORT_WORKER_SECRET_PREVIOUS,
    process.env.CRON_SECRET,
    process.env.CRON_SECRET_PREVIOUS,
  )
}

function authorized(request: Request, secrets: string[]): boolean {
  return bearerMatchesAnySecret(request, secrets)
}

function batchSize(): number {
  const configured = Number.parseInt(process.env.RESEARCH_EXPORT_WORKER_BATCH_SIZE ?? "10", 10)
  if (!Number.isFinite(configured)) return 10
  return Math.min(25, Math.max(1, configured))
}

async function processNext(request: Request) {
  const secrets = configuredSecrets()
  if (secrets.length === 0) {
    return NextResponse.json(
      { error: "Research export worker is not configured", code: "WORKER_NOT_CONFIGURED" },
      { status: 503 },
    )
  }
  if (!authorized(request, secrets)) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  try {
    const cleanup = await cleanupResearchExportArtifacts(batchSize() * 10)
    const ids: string[] = []
    let failed = 0
    for (let index = 0; index < batchSize(); index += 1) {
      try {
        const record = await processResearchExport()
        if (!record) break
        ids.push(record.id)
      } catch {
        failed += 1
        console.error("[research-export] RESEARCH_EXPORT_JOB_FAILED")
        await emitStatusEvent("RESEARCH_EXPORT_WORKER_FAILED", { stage: "job" })
      }
    }
    return NextResponse.json({ processed: ids.length, failed, ids, cleanup })
  } catch {
    console.error("[research-export] RESEARCH_EXPORT_WORKER_FAILED")
    await emitStatusEvent("RESEARCH_EXPORT_WORKER_FAILED", { stage: "worker" })
    return NextResponse.json(
      { error: "Research export processing failed", code: "RESEARCH_EXPORT_PROCESSING_FAILED" },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return processNext(request)
}

export async function POST(request: Request) {
  return processNext(request)
}
export const dynamic = "force-dynamic"
export const maxDuration = 300
