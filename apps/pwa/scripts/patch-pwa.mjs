// Injects PWA manifest link, Apple meta tags, and SW registration into dist/index.html.
// Run after `expo export --platform web`.
import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dir = dirname(fileURLToPath(import.meta.url))
const htmlPath = resolve(__dir, "../dist/index.html")

let html = readFileSync(htmlPath, "utf8")

// Expo emits its reset as an inline style. Move it to a same-origin stylesheet
// so the deployment can keep script/style elements under a hash-free CSP.
html = html.replace(
  /<style id="expo-reset">[\s\S]*?<\/style>/,
  '<link rel="stylesheet" href="/expo-reset.css">',
)

const additions = [
  [html.includes('rel="manifest"'), '<link rel="manifest" href="/manifest.webmanifest">'],
  [html.includes('name="apple-mobile-web-app-capable"'), '<meta name="apple-mobile-web-app-capable" content="yes">'],
  [html.includes('name="apple-mobile-web-app-status-bar-style"'), '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'],
  [html.includes('name="apple-mobile-web-app-title"'), '<meta name="apple-mobile-web-app-title" content="LOSPOR">'],
  [html.includes('rel="apple-touch-icon"'), '<link rel="apple-touch-icon" href="/icon-192.png">'],
  [html.includes('src="/register-sw.js"'), '<script src="/register-sw.js" defer></script>'],
]
  .filter(([present]) => !present)
  .map(([, markup]) => markup)

if (additions.length > 0) html = html.replace("</head>", `${additions.join("\n")}\n</head>`)
writeFileSync(htmlPath, html, "utf8")
console.log(`patch-pwa: hardened reset persisted; ${additions.length} PWA element(s) added`)
