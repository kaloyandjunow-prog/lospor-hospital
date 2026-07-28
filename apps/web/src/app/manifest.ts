import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LOSPOR — Perioperative Register",
    short_name: "LOSPOR",
    description: "Large Open Source Perioperative Register — clinical anaesthesia documentation",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#090b0c",
    theme_color: "#090b0c",
    categories: ["medical", "health"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
