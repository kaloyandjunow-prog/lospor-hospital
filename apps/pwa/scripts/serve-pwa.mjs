import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

// Serve under the appliance's own deployed response headers, matching
// infra/nginx/pwa.conf exactly -- the two cannot be read from one shared file
// because that file would have to be vercel.json, and the appliance's overlay
// gate forbids that file existing in this tree at all. Kept in step by hand.
//
// This is not housekeeping. Without a real header set here the suite ran with
// no Content-Security-Policy at all, and a policy that blanks the deployed
// app -- `style-src-elem` with no 'unsafe-inline', against a react-native-web
// StyleSheet injected at runtime and so neither hashable nor file-servable --
// passes every gate green. That already happened once upstream; it happened
// again here, silently, the moment vercel.json stopped existing to read.
const deploymentHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(self), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
}

const root = resolve("dist")
const port = Number(process.env.PWA_PORT ?? 3001)
const proxyTarget = process.env.PWA_API_PROXY_TARGET
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
  if (proxyTarget && (pathname === "/v1" || pathname.startsWith("/v1/") || pathname.startsWith("/health/"))) {
    const upstream = new URL(request.url ?? "/", proxyTarget)
    const proxied = httpRequest(upstream, {
      method: request.method,
      headers: { ...request.headers, host: upstream.host },
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    })
    proxied.on("error", () => {
      response.statusCode = 502
      response.end("Hospital API unavailable")
    })
    request.pipe(proxied)
    return
  }
  const appPath = pathname === "/app" || pathname === "/app/"
    ? "/"
    : pathname.startsWith("/app/")
      ? pathname.slice("/app".length)
      : pathname
  const relativePath = normalize(appPath).replace(/^[/\\]+/, "")
  let file = join(root, relativePath)
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html")
  }
  for (const [name, value] of Object.entries(deploymentHeaders)) response.setHeader(name, value)
  response.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream")
  response.setHeader("Cache-Control", file.endsWith("index.html") ? "no-cache" : "public, max-age=3600")
  createReadStream(file).on("error", () => {
    response.statusCode = 500
    response.end("Could not read PWA asset")
  }).pipe(response)
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`LOSPOR PWA listening on http://0.0.0.0:${port}\n`)
})
