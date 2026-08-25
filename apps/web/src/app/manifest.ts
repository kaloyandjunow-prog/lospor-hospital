import type { MetadataRoute } from "next"
import {
  configuredDefaultLocale,
  pwaManifestCopyForLocale,
} from "@/i18n/locales"

// Generated metadata routes are cached by default. The installer supplies its
// locale at container runtime, so this manifest must be evaluated per request.
export const dynamic = "force-dynamic"

export default function manifest(): MetadataRoute.Manifest {
  const locale = configuredDefaultLocale()
  const copy = pwaManifestCopyForLocale(locale)
  return {
    name: copy.name,
    short_name: copy.shortName,
    description: copy.description,
    lang: locale,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#090b0c",
    theme_color: "#090b0c",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
