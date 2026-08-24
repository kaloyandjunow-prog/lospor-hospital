import { execFileSync } from "child_process"
import path from "path"

/**
 * The exact Terms and Privacy text this deployment shows, as the API expects it.
 *
 * 1.2.0 made registration an acceptance of *named, checksummed* documents rather
 * than a tickbox, and the API refuses to serve `GET /v1/legal/documents` — and
 * therefore refuses to register anybody — until it is told what those documents
 * say. Without it the suite cannot exercise registration at all.
 *
 * Built by running the generator the deployment itself uses, rather than pinning
 * a copy here: a copy would drift from the text on screen without anything
 * noticing, and the checksum is the whole point.
 */
export function cloudLegalDocumentsJson(): string {
  const root = path.join(__dirname, "..")
  return execFileSync(
    process.execPath,
    [path.join(root, "scripts", "generate-cloud-legal-manifest.mjs")],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ).trim()
}
