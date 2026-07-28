import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

export async function sha256File(path: string): Promise<{
  sha256: string
  byteSize: number
}> {
  const hash = createHash("sha256")
  let byteSize = 0
  for await (const chunk of createReadStream(path)) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    byteSize += value.length
    hash.update(value)
  }
  return { sha256: hash.digest("hex"), byteSize }
}

