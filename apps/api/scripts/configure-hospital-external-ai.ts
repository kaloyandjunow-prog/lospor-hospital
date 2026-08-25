import "dotenv/config"
import { replaceExternalAiCredential } from "../src/lib/hospital/control-plane"

const MAX_STDIN_BYTES = 4097

async function readOptionalCredential(): Promise<string> {
  process.stdin.setEncoding("utf8")
  let input = ""
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input, "utf8") > MAX_STDIN_BYTES) {
      throw new Error("EXTERNAL_AI_CREDENTIAL_TOO_LARGE")
    }
  }
  // A terminal or a shell pipe normally contributes one final line ending.
  // Remove only that transport delimiter; never accept another field or put the
  // credential in argv/environment where process inspection can reveal it.
  return input.replace(/\r?\n$/, "")
}

async function main() {
  if (process.env.LOSPOR_DEPLOYMENT_MODE !== "hospital") {
    throw new Error("HOSPITAL_DEPLOYMENT_REQUIRED")
  }
  const credential = await readOptionalCredential()
  if (!credential.trim()) {
    process.stdout.write(`${JSON.stringify({ ok: true, configured: false, skipped: true })}\n`)
    return
  }
  await replaceExternalAiCredential({
    credential,
    reason: "Configured during guided installation",
  })
  process.stdout.write(`${JSON.stringify({ ok: true, configured: true })}\n`)
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: "HOSPITAL_EXTERNAL_AI_BOOTSTRAP_FAILED" })}\n`)
  process.exitCode = 1
})
