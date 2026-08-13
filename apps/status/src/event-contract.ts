import { finiteInteger, hasExactKeys, isRecord, validIsoDate } from "./util.js"

type PrimitiveFact = string | number | boolean

type EventDefinition = {
  severity: "info" | "warning" | "critical"
  message: string
  parseFacts: (value: unknown) => Record<string, PrimitiveFact> | null
}

function emptyFacts(value: unknown): Record<string, PrimitiveFact> | null {
  return isRecord(value) && Object.keys(value).length === 0 ? {} : null
}

function strictFacts(
  value: unknown,
  definitions: Record<string, (fact: unknown) => PrimitiveFact | null>,
  optional: readonly string[] = [],
): Record<string, PrimitiveFact> | null {
  if (!isRecord(value)) return null
  const required = Object.keys(definitions).filter(key => !optional.includes(key))
  if (!hasExactKeys(value, required, optional)) return null
  const result: Record<string, PrimitiveFact> = {}
  for (const [name, parser] of Object.entries(definitions)) {
    if (!Object.hasOwn(value, name)) continue
    const parsed = parser(value[name])
    if (parsed === null) return null
    result[name] = parsed
  }
  return result
}

function enumFact<const T extends readonly string[]>(allowed: T) {
  return (value: unknown): T[number] | null =>
    typeof value === "string" && allowed.includes(value) ? value as T[number] : null
}

function integerFact(minimum: number, maximum: number) {
  return (value: unknown): number | null => finiteInteger(value, minimum, maximum) ? value : null
}

const EVENT_DEFINITIONS = {
  AUDIT_WRITE_FAILED: {
    severity: "critical",
    message: "Clinical audit recording failed",
    parseFacts: emptyFacts,
  },
  EMAIL_DELIVERY_FAILED: {
    severity: "warning",
    message: "An appliance email could not be delivered",
    parseFacts: (value: unknown) => strictFacts(value, {
      category: enumFact(["verification", "password-reset", "transactional"] as const),
      failureKind: enumFact(["network", "provider", "configuration"] as const),
      httpStatus: integerFact(100, 599),
    }, ["httpStatus"]),
  },
  AI_PROVIDER_REQUEST_FAILED: {
    severity: "warning",
    message: "An optional AI request failed",
    parseFacts: (value: unknown) => strictFacts(value, {
      feature: enumFact(["advise", "case-advise", "read-labs", "vitals-scan"] as const),
      failureKind: enumFact(["timeout", "network", "provider", "invalid-response", "configuration"] as const),
      httpStatus: integerFact(100, 599),
    }, ["httpStatus"]),
  },
  RESEARCH_EXPORT_WORKER_FAILED: {
    severity: "warning",
    message: "Research export processing failed",
    parseFacts: (value: unknown) => strictFacts(value, {
      stage: enumFact(["job", "worker", "cleanup"] as const),
      failedJobs: integerFact(0, 1_000_000),
    }, ["failedJobs"]),
  },
  CENTRAL_DELIVERY_FAILED: {
    severity: "warning",
    message: "Central delivery failed and will require retry",
    parseFacts: (value: unknown) => strictFacts(value, {
      stage: enumFact(["reserve", "generate", "upload", "receipt", "worker"] as const),
    }),
  },
  CLINICAL_DATA_SYNC_FAILED: {
    severity: "critical",
    message: "Clinical data synchronization failed",
    parseFacts: (value: unknown) => strictFacts(value, {
      stage: enumFact(["field-audit", "snapshot", "relational"] as const),
    }),
  },
  CLINICAL_WRITE_FAILED: {
    severity: "critical",
    message: "A clinical record operation failed",
    parseFacts: (value: unknown) => strictFacts(value, {
      operation: enumFact([
        "case-create", "case-update", "case-delete", "event-create", "event-update",
        "event-delete", "finalize", "unfinalize", "transfer",
      ] as const),
    }),
  },
  RESEARCH_REQUEST_FAILED: {
    severity: "warning",
    message: "A research request failed",
    parseFacts: emptyFacts,
  },
  CLINICAL_DOCUMENT_RENDER_FAILED: {
    severity: "warning",
    message: "A clinical document could not be rendered",
    parseFacts: emptyFacts,
  },
  CLINICAL_RULES_OPERATION_FAILED: {
    severity: "warning",
    message: "A clinical rules operation failed",
    parseFacts: (value: unknown) => strictFacts(value, {
      operation: enumFact(["load", "write"] as const),
    }),
  },
  APPLIANCE_OPERATOR_CHANGED: {
    severity: "info",
    message: "The appliance operator credential changed",
    parseFacts: (value: unknown) => strictFacts(value, {
      operation: enumFact(["initialize", "rotate", "transfer", "reconcile"] as const),
      credentialGeneration: integerFact(1, 1_000_000),
    }),
  },
} as const satisfies Record<string, EventDefinition>

export type SafeOperationalEvent = {
  id: string
  occurredAt: number
  code: keyof typeof EVENT_DEFINITIONS
  severity: "info" | "warning" | "critical"
  message: string
  facts: Record<string, PrimitiveFact>
}

export function parseSafeOperationalEvent(
  value: unknown,
  now = Date.now(),
): SafeOperationalEvent | null {
  if (!isRecord(value) || !hasExactKeys(value, ["eventId", "occurredAt", "code", "facts"])) return null
  if (typeof value.eventId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.eventId)) return null
  if (!validIsoDate(value.occurredAt)) return null
  const occurredAt = Date.parse(value.occurredAt)
  if (occurredAt > now + 5 * 60_000 || occurredAt < now - 30 * 86_400_000) return null
  if (typeof value.code !== "string" || !Object.hasOwn(EVENT_DEFINITIONS, value.code)) return null
  const code = value.code as keyof typeof EVENT_DEFINITIONS
  const definition: EventDefinition = EVENT_DEFINITIONS[code]
  const facts = definition.parseFacts(value.facts)
  if (!facts) return null
  return {
    id: value.eventId,
    occurredAt,
    code,
    severity: definition.severity,
    message: definition.message,
    facts,
  }
}

export const SAFE_EVENT_CODES = Object.freeze(Object.keys(EVENT_DEFINITIONS))
