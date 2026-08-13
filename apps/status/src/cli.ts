import { StatusDatabase } from "./db.js"
import { AuthError, AuthService } from "./auth.js"
import { finiteInteger, isRecord, safeJsonParse } from "./util.js"

async function readInput(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += value.length
    if (bytes > 8192) throw new Error("Input is too large")
    chunks.push(value)
  }
  const text = Buffer.concat(chunks).toString("utf8").trim()
  if (!text) return {}
  const parsed = safeJsonParse(text)
  if (!isRecord(parsed)) throw new Error("Input must be one JSON object")
  return parsed
}

function stringField(input: Record<string, unknown>, name: string): string {
  const value = input[name]
  if (typeof value !== "string") throw new Error(`${name} is required`)
  return value
}

async function main(): Promise<void> {
  const command = process.argv[2]
  const allowed = new Set([
    "init-auth", "auth-prepare", "auth-commit", "auth-abort", "auth-state", "recovery-token",
  ])
  if (!command || !allowed.has(command) || process.argv.length !== 3) {
    throw new Error("Usage: cli <init-auth|auth-prepare|auth-commit|auth-abort|auth-state|recovery-token>")
  }
  const databasePath = process.env.STATUS_DATABASE_PATH?.trim() || "/data/status.sqlite"
  const db = new StatusDatabase(databasePath)
  try {
    const input = await readInput()
    const auth = new AuthService(db, Buffer.alloc(32), 12)
    let result: unknown
    switch (command) {
      case "init-auth":
        if (input.generation !== undefined && !finiteInteger(input.generation, 1, 1_000_000)) {
          throw new Error("generation must be a positive integer")
        }
        result = await auth.initialize(
          stringField(input, "email"),
          stringField(input, "password"),
          input.generation as number | undefined,
        )
        break
      case "auth-prepare": {
        const expected = input.expectedGeneration
        if (expected !== undefined && !finiteInteger(expected, 1)) {
          throw new Error("expectedGeneration must be a positive integer")
        }
        result = await auth.prepare({
          email: stringField(input, "email"),
          password: stringField(input, "password"),
          ...(expected === undefined ? {} : { expectedGeneration: expected as number }),
        })
        break
      }
      case "auth-commit":
        result = auth.commit(stringField(input, "transactionId"))
        break
      case "auth-abort":
        result = auth.abort(stringField(input, "transactionId"))
        break
      case "auth-state":
        result = auth.state()
        break
      case "recovery-token": {
        const ttl = input.ttlMinutes
        if (ttl !== undefined && !finiteInteger(ttl, 1, 60)) {
          throw new Error("ttlMinutes must be an integer from 1 to 60")
        }
        result = auth.createRecoveryToken(ttl as number | undefined)
        break
      }
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof AuthError || error instanceof Error
    ? error.message
    : "Credential operation failed"
  process.stderr.write(`${JSON.stringify({ error: message })}\n`)
  process.exitCode = 1
})
