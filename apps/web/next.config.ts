import type { NextConfig } from "next"
import { networkInterfaces } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import createNextIntlPlugin from "next-intl/plugin"
import { CORS_REQUEST_HEADERS_VALUE } from "@lospor/core/sync"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")
const isDev = process.env.NODE_ENV !== "production"
const isProdVercel = !isDev && process.env.VERCEL_ENV === "production"
// In production set CORS_ALLOW_ORIGIN (or CORS_ALLOW_ORIGINS) to the PWA/mobile origin.
// Dev defaults to * so the local PWA on :3001 can reach the API on :3000.
// Production Vercel deployments throw at build time if the env var is missing.
// This header exists only for the temporary V6 /api compatibility proxy.
const corsOrigin = isDev
  ? "*"
  : (process.env.CORS_ALLOW_ORIGINS?.split(",")[0]?.trim() ??
     process.env.CORS_ALLOW_ORIGIN?.trim() ??
     (isProdVercel
       ? (() => { throw new Error("CORS_ALLOW_ORIGIN or CORS_ALLOW_ORIGINS must be set in production") })()
       : "*"))

function devLanHosts(): string[] {
  const explicit = process.env.LOSPOR_DEV_HOST?.trim()
  if (explicit) return [explicit]

  const hosts = new Set<string>()
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(entry.address)) {
        hosts.add(entry.address)
      }
    }
  }
  return [...hosts]
}

const devHosts = isDev ? devLanHosts() : []
const devWsOrigins = devHosts.map(host => ` ws://${host}:3000`).join("")
const apiInternalUrl = (
  process.env.LOSPOR_API_INTERNAL_URL ?? "http://127.0.0.1:3002"
).replace(/\/$/, "")

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  transpilePackages: ["@lospor/core"],

  // Allow current local network IPs so HMR and JS hydration work when accessed from the LAN.
  ...(isDev ? { allowedDevOrigins: devHosts } : {}),

  // Keep local startup light while the UI and API run as separate processes.
  ...(isDev ? { experimental: { preloadEntriesOnStart: false } } : {}),

  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${apiInternalUrl}/v1/:path*`,
        },
      ],
    }
  },

  async headers() {
    return [
    {
      // CORS for React Native mobile app — bearer token auth still required on all routes
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin",  value: corsOrigin },
        { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: CORS_REQUEST_HEADERS_VALUE },
      ],
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options",        value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'",
          // Dev mode webpack bundles use eval() for source maps — stripped in production builds
          `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          // Dev HMR uses ws: on the same host; production only needs self
          `connect-src 'self'${isDev ? `${devWsOrigins} ws://localhost:3000` : ""}`,
          "form-action 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; ") },
      ],
    }]
  },
}

// Hospital builds intentionally have no third-party telemetry. Operational
// events stay on the appliance and are accepted only through a strict local
// allowlist by the independent Status service.
export default withNextIntl(nextConfig)
