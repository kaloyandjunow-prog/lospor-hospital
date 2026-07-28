import type { NextConfig } from "next"
import { networkInterfaces } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const apiInternalUrl = (
  process.env.LOSPOR_API_INTERNAL_URL ?? "http://127.0.0.1:3002"
).replace(/\/$/, "")

const localDevOrigins = Object.values(networkInterfaces())
  .flat()
  .filter(address => address?.family === "IPv4" && !address.internal)
  .map(address => address!.address)

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  allowedDevOrigins: ["127.0.0.1", ...localDevOrigins],
  transpilePackages: ["@lospor/core"],
  async rewrites() {
    return {
      beforeFiles: [{
        source: "/api/:path*",
        destination: `${apiInternalUrl}/v1/:path*`,
      }],
    }
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            `connect-src 'self'${process.env.NODE_ENV !== "production" ? " ws: http:" : ""}`,
            "form-action 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    }]
  },
}

export default config
