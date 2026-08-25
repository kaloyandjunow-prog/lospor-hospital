import { readFileSync } from "node:fs"
import { createServer as createHttpServer } from "node:http"
import { createServer as createHttpsServer } from "node:https"
import { AuthService } from "./auth.js"
import { createStatusApp } from "./app.js"
import { loadConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { StatusMonitor } from "./monitor.js"
import { nodeRequestHandler } from "./node-server.js"

const config = loadConfig()
const db = new StatusDatabase(config.databasePath)
const auth = new AuthService(
  db,
  config.rateLimitKey,
  12,
  Date.now,
  undefined,
  config.mfaEncryptionKey,
)
const app = createStatusApp({ db, auth, config })
const monitor = new StatusMonitor(config, db)

const httpServer = createHttpServer(nodeRequestHandler(app.fetch, "http"))
httpServer.listen(config.httpPort, "0.0.0.0")
const servers = [httpServer]
if (config.tlsCertFile && config.tlsKeyFile) {
  const cert = readFileSync(config.tlsCertFile)
  const key = readFileSync(config.tlsKeyFile)
  const httpsServer = createHttpsServer({ cert, key }, nodeRequestHandler(app.fetch, "https"))
  httpsServer.listen(config.httpsPort, "0.0.0.0")
  servers.push(httpsServer)
}
monitor.start()
process.stdout.write("LOSPOR status monitor started\n")

let stopping = false
function shutdown(): void {
  if (stopping) return
  stopping = true
  monitor.stop()
  let remaining = servers.length
  const done = () => {
    remaining -= 1
    if (remaining === 0) {
      db.close()
      process.exit(0)
    }
  }
  for (const server of servers) server.close(done)
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
