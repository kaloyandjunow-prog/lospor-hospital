import webConfig from "./apps/web/playwright.config"
import path from "node:path"

const setupProject = webConfig.projects?.find(project => project.name === "setup")
const authedProject = webConfig.projects?.find(project => project.name === "authed")

// The imported Web config's relative server directories are correct when the
// Web package invokes Playwright from apps/web. This Hospital config is loaded
// from the repository root, however; resolving `../api` from that config would
// point outside the checkout and Node reports the resulting child-process
// failure as `spawn /bin/sh ENOENT`. Keep the same commands, but anchor both
// servers to the actual vendored app directories.
const hospitalWebServer = Array.isArray(webConfig.webServer)
  ? webConfig.webServer.map(server => ({
      ...server,
      cwd: server.cwd === "../api"
        ? path.resolve(__dirname, "apps/api")
        : path.resolve(__dirname, "apps/web"),
    }))
  : webConfig.webServer

if (!setupProject || !authedProject) {
  throw new Error("Hospital pediatric Playwright config requires the Web setup and authed projects")
}

// The Web tree is vendored and provenance-checked byte-for-byte. This config
// reuses its real servers, database setup and authenticated project while the
// Hospital-owned release regression stays outside apps/web.
export default {
  ...webConfig,
  testDir: ".",
  webServer: hospitalWebServer,
  globalSetup: "./apps/web/e2e/global-setup.ts",
  projects: [
    {
      ...setupProject,
      testMatch: /[\\/]apps[\\/]web[\\/]e2e[\\/]auth\.setup\.ts$/,
    },
    {
      ...authedProject,
      testMatch: /[\\/]hospital-e2e[\\/]pediatric-mode\.authed\.spec\.ts$/,
      dependencies: ["setup"],
    },
  ],
}
