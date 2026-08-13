process.stdin.setEncoding("utf8")
let input = ""
for await (const chunk of process.stdin) input += chunk

let parsed
try {
  parsed = JSON.parse(input)
} catch {
  throw new Error("STATUS_PREPARE_RESPONSE_INVALID")
}

if (typeof parsed.transactionId !== "string" ||
    !Number.isInteger(parsed.pendingGeneration) || parsed.pendingGeneration < 1) {
  throw new Error("STATUS_PREPARE_RESPONSE_INVALID")
}

process.stdout.write(`${parsed.transactionId}\n${parsed.pendingGeneration}\n`)
