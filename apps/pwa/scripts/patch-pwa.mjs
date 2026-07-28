// Injects PWA manifest link, Apple meta tags, and SW registration into dist/index.html.
// Run after `expo export --platform web`.
import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dir = dirname(fileURLToPath(import.meta.url))
const htmlPath = resolve(__dir, "../dist/index.html")

let html = readFileSync(htmlPath, "utf8")

const injection = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="theme-color" content="#090b0c">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="LOSPOR">',
  '<link rel="apple-touch-icon" href="/icon-192.png">',
  "<script>if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>",
].join("\n")

if (html.includes('rel="manifest"')) {
  console.log("patch-pwa: manifest link already present, skipping")
} else {
  html = html.replace("</head>", injection + "\n</head>")
  writeFileSync(htmlPath, html, "utf8")
  console.log("patch-pwa: injected manifest + SW registration into dist/index.html")
}
