import type { IncomingMessage, ServerResponse } from "node:http"

type FetchHandler = (request: Request) => Response | Promise<Response>

async function requestBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += value.length
    if (bytes > 8192) throw new Error("REQUEST_TOO_LARGE")
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export function nodeRequestHandler(
  fetchHandler: FetchHandler,
  protocol: "http" | "https",
): (request: IncomingMessage, response: ServerResponse) => void {
  return (incoming, outgoing) => {
    void (async () => {
      try {
        const host = incoming.headers.host || "127.0.0.1"
        const body = await requestBody(incoming)
        const headers = new Headers()
        for (const [name, raw] of Object.entries(incoming.headers)) {
          if (raw === undefined) continue
          if (Array.isArray(raw)) raw.forEach(value => headers.append(name, value))
          else headers.set(name, raw)
        }
        headers.set("x-lospor-status-peer", incoming.socket.remoteAddress || "local")
        const request = new Request(`${protocol}://${host}${incoming.url || "/"}`, {
          method: incoming.method || "GET",
          headers,
          ...(body === undefined ? {} : { body }),
        })
        const result = await fetchHandler(request)
        outgoing.statusCode = result.status
        outgoing.statusMessage = result.statusText
        for (const [name, value] of result.headers) {
          if (name.toLowerCase() !== "set-cookie") outgoing.setHeader(name, value)
        }
        const cookies = result.headers.getSetCookie()
        if (cookies.length) outgoing.setHeader("set-cookie", cookies)
        outgoing.end(Buffer.from(await result.arrayBuffer()))
      } catch (error) {
        if (!outgoing.headersSent) {
          const tooLarge = error instanceof Error && error.message === "REQUEST_TOO_LARGE"
          outgoing.statusCode = tooLarge ? 413 : 500
          outgoing.setHeader("content-type", "application/json")
          outgoing.setHeader("cache-control", "private, no-store, max-age=0")
          outgoing.setHeader("x-content-type-options", "nosniff")
        }
        outgoing.end(JSON.stringify({
          error: outgoing.statusCode === 413 ? "Request too large" : "Service unavailable",
          code: outgoing.statusCode === 413 ? "REQUEST_TOO_LARGE" : "INTERNAL_ERROR",
        }))
      }
    })()
  }
}
