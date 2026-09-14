import type { NextConfig } from "next"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@lospor/core", "@lospor/exchange-contract"],
  turbopack: {
    root: repositoryRoot,
  },
  outputFileTracingIncludes: {
    "/v1/search/procedures": ["./src/data/pcs.json"],
    // The EHR import reads ICD-10-PCS operations from the same table.
    "/v1/cases/[id]/ehr-import": ["./src/data/pcs.json"],
    "/v1/internal/ehr-import/scan": ["./src/data/pcs.json"],
    "/v1/search/drugs": ["./src/data/drugs.json"],
  },
  poweredByHeader: false,
}

export default nextConfig
