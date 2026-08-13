import {
  cleanAcceptedArtifacts,
  processAvailableCentralDeliveries,
} from "../src/lib/hospital/delivery-worker"
import { emitStatusEvent } from "../src/lib/hospital/status-events"

async function main() {
  const processed = await processAvailableCentralDeliveries(10)
  const cleaned = await cleanAcceptedArtifacts()
  console.log(JSON.stringify({ processed, cleaned }))
}

main().catch(async () => {
  console.error("[hospital-central-delivery] CENTRAL_DELIVERY_FAILED")
  await emitStatusEvent("CENTRAL_DELIVERY_FAILED", { stage: "worker" })
  process.exitCode = 1
})

