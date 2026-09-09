/**
 * Reduce credential-state JSON to a small, shell-safe record.
 *
 * The shared monotonic generation is the cross-store invariant. Login names
 * and optional contact emails must never be transported or compared here.
 */
const mode = process.argv[2]

process.stdin.setEncoding("utf8")
let input = ""
for await (const chunk of process.stdin) input += chunk

let parsed
try {
  parsed = JSON.parse(input)
} catch {
  throw new Error("OPERATOR_STATE_INVALID")
}

if (!parsed || typeof parsed !== "object" || typeof parsed.initialized !== "boolean") {
  throw new Error("OPERATOR_STATE_INVALID")
}

if (mode === "clinical") {
  if (!Number.isInteger(parsed.credentialGeneration) || parsed.credentialGeneration < 0) {
    throw new Error("OPERATOR_STATE_INVALID")
  }
  process.stdout.write([
    parsed.initialized ? "true" : "false",
    String(parsed.credentialGeneration),
  ].join(" ") + "\n")
} else if (mode === "status") {
  const generation = parsed.initialized ? parsed.generation : 0
  if (!Number.isInteger(generation) || generation < 0) {
    throw new Error("OPERATOR_STATE_INVALID")
  }
  const pending = parsed.pending
  if (pending !== undefined && (
    !pending || typeof pending !== "object" ||
    typeof pending.transactionId !== "string" ||
    !Number.isInteger(pending.generation) || pending.generation < 1
  )) {
    throw new Error("OPERATOR_STATE_INVALID")
  }
  process.stdout.write([
    parsed.initialized ? "true" : "false",
    String(generation),
    pending?.transactionId ?? "-",
    String(pending?.generation ?? 0),
  ].join(" ") + "\n")
} else {
  throw new Error("UNKNOWN_OPERATOR_STATE_MODE")
}
