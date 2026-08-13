import { prisma } from "@/lib/prisma"
import { cleanupResearchExportArtifacts, processResearchExport } from "@/lib/research/exports"
import { emitStatusEvent } from "@/lib/hospital/status-events"

function requestedLimit(): number {
  const argument = process.argv.find(value => value.startsWith("--limit="))?.split("=")[1]
  const parsed = Number.parseInt(argument ?? process.env.RESEARCH_EXPORT_WORKER_BATCH_SIZE ?? "10", 10)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 10
}

async function main() {
  const cleanup = await cleanupResearchExportArtifacts(500)
  console.log("Research export cleanup", cleanup)
  const ids: string[] = []
  let failed = 0
  for (let index = 0; index < requestedLimit(); index += 1) {
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
  console.log(JSON.stringify({ processed: ids.length, failed, ids }, null, 2))
}

main()
  .catch(async () => {
    console.error("[research-export] RESEARCH_EXPORT_WORKER_FAILED")
    await emitStatusEvent("RESEARCH_EXPORT_WORKER_FAILED", { stage: "worker" })
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
