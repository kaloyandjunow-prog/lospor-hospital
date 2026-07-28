import {
  cleanAcceptedArtifacts,
  processAvailableCentralDeliveries,
} from "../src/lib/hospital/delivery-worker"

const processed = await processAvailableCentralDeliveries(10)
const cleaned = await cleanAcceptedArtifacts()
console.log(JSON.stringify({ processed, cleaned }))

