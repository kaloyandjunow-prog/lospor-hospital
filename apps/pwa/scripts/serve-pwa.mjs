import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

const root = resolve("dist")
const port = Number(process.env.PWA_PORT ?? 3001)
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)
  const relativePath = normalize(pathname).replace(/^[/\\]+/, "")
  let file = join(root, relativePath)
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html")
  }
  response.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream")
  response.setHeader("Cache-Control", file.endsWith("index.html") ? "no-cache" : "public, max-age=3600")
  createReadStream(file).on("error", () => {
    response.statusCode = 500
    response.end("Could not read PWA asset")
  }).pipe(response)
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`LOSPOR PWA listening on http://0.0.0.0:${port}\n`)
})
