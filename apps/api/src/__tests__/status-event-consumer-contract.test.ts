import { describe, expect, it } from "vitest"
import {
  makeSafeStatusEvent,
  type StatusEventCode,
} from "@/lib/hospital/status-events"
import { parseSafeOperationalEvent } from "../../../status/src/event-contract"

const examples = {
  AUDIT_WRITE_FAILED: {},
  EMAIL_DELIVERY_FAILED: { category: "verification", failureKind: "network" },
  AI_PROVIDER_REQUEST_FAILED: { feature: "advise", failureKind: "configuration" },
  RESEARCH_EXPORT_WORKER_FAILED: { stage: "worker", failedJobs: 1 },
  CENTRAL_DELIVERY_FAILED: { stage: "receipt" },
  CLINICAL_DATA_SYNC_FAILED: { stage: "relational" },
  CLINICAL_WRITE_FAILED: { operation: "finalize" },
  RESEARCH_REQUEST_FAILED: {},
  CLINICAL_DOCUMENT_RENDER_FAILED: {},
  CLINICAL_RULES_OPERATION_FAILED: { operation: "write" },
  APPLIANCE_OPERATOR_CHANGED: { operation: "reconcile", credentialGeneration: 4 },
} as const satisfies Record<StatusEventCode, object>

describe("API to Status event contract", () => {
  for (const [code, facts] of Object.entries(examples)) {
    it(`is accepted by the Status consumer for ${code}`, () => {
      const produced = makeSafeStatusEvent(code as StatusEventCode, facts as never)
      expect(produced).not.toBeNull()
      expect(parseSafeOperationalEvent(produced, Date.now())).toMatchObject({ code })
    })
  }
})
