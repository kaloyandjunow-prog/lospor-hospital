import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
// Both names are in use: the appliance's own handler calls httpRequest, and
// upstream's proxy path calls proxyRequest.
import { request as proxyRequest } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

// Serve under the deployment's own response headers, read from vercel.json
// rather than restated here so the two cannot drift apart.
//
// This is not housekeeping. Without it the suite ran with no Content-Security
// -Policy at all, and a policy that blanked the deployed app — `style-src-elem`
// with no 'unsafe-inline', against a react-native-web StyleSheet that is
// injected at runtime and cannot be hashed — passed every gate green.
const deploymentHeaders = (() => {
  const routes = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")).routes ?? []
  const route = routes.find(entry => entry.headers?.["Content-Security-Policy"])
  if (!route) {
    console.error("vercel.json declares no Content-Security-Policy; the suite would not test the deployed policy")
    process.exit(1)
  }
  return route.headers
})()

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
