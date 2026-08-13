/**
 * Turn newline-delimited installer input into a strict JSON document.
 *
 * Passwords are intentionally read from stdin. Do not add password flags or
 * environment fallbacks: argv and process environments are inspectable while
 * an installation/rotation is running.
 */
const mode = process.argv[2]
const MAX_BYTES = 64 * 1024

process.stdin.setEncoding("utf8")
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
  if (Buffer.byteLength(input, "utf8") > MAX_BYTES) {
    throw new Error("CREDENTIAL_INPUT_TOO_LARGE")
  }
}

const lines = input.replace(/\r/g, "").split("\n")
const required = (index, name) => {
  const value = lines[index] ?? ""
  if (!value) throw new Error(`${name}_REQUIRED`)
  return value
}

let result
switch (mode) {
  case "status-init":
    result = { email: required(0, "EMAIL"), password: required(1, "PASSWORD") }
    if (lines[2]) result.generation = Number(lines[2])
    break
  case "clinical-bootstrap":
    result = {
      email: required(0, "EMAIL"),
      password: required(1, "PASSWORD"),
      credentialGeneration: Number(required(2, "GENERATION")),
    }
    break
  case "status-prepare":
    result = { email: required(0, "EMAIL"), password: required(1, "PASSWORD") }
    if (lines[2]) result.expectedGeneration = Number(lines[2])
    break
  case "clinical-operator":
    result = {
      operation: required(0, "OPERATION"),
      email: required(1, "EMAIL"),
      password: required(2, "PASSWORD"),
      credentialGeneration: Number(required(3, "GENERATION")),
    }
    break
  case "transaction":
    result = { transactionId: required(0, "TRANSACTION_ID") }
    break
  case "central-enrollment":
    result = {
      token: required(0, "ENROLLMENT_TOKEN"),
      centralBaseUrl: required(1, "CENTRAL_URL"),
      siteCode: required(2, "SITE_CODE"),
      siteName: required(3, "SITE_NAME"),
    }
    break
  default:
    throw new Error("UNKNOWN_CREDENTIAL_JSON_MODE")
}

if ("credentialGeneration" in result &&
    (!Number.isInteger(result.credentialGeneration) || result.credentialGeneration < 1)) {
  throw new Error("GENERATION_INVALID")
}
if ("expectedGeneration" in result &&
    (!Number.isInteger(result.expectedGeneration) || result.expectedGeneration < 0)) {
  throw new Error("EXPECTED_GENERATION_INVALID")
}
if ("generation" in result &&
    (!Number.isInteger(result.generation) || result.generation < 1)) {
  throw new Error("GENERATION_INVALID")
}

process.stdout.write(`${JSON.stringify(result)}\n`)
