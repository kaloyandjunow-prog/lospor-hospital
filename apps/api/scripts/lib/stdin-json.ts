const MAX_STDIN_BYTES = 64 * 1024

/** Read one JSON document from stdin without ever accepting secrets in argv/env. */
export async function readJsonStdin(): Promise<unknown> {
  process.stdin.setEncoding("utf8")
  let input = ""
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input, "utf8") > MAX_STDIN_BYTES) {
      throw new Error("STDIN_TOO_LARGE")
    }
  }
  if (!input.trim()) throw new Error("JSON_STDIN_REQUIRED")
  try {
    return JSON.parse(input) as unknown
  } catch {
    throw new Error("INVALID_JSON_STDIN")
  }
}
