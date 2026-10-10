// Shared by the cross-app Status fixture server and the specs that drive it.
import path from "node:path"

export const STATUS_E2E_PORT = Number(process.env.E2E_STATUS_PORT ?? "3314")
export const STATUS_E2E_BASE = "http://127.0.0.1:" + STATUS_E2E_PORT
export const STATUS_E2E_EMAIL = "status-admin@e2e.test"
export const STATUS_E2E_PASSWORD = "Status e2e password phrase1!"
export const STATUS_E2E_SESSION_FILE = path.join(__dirname, "..", ".auth", "status-session.txt")
