import webConfig from "./apps/web/playwright.config"

const setupProject = webConfig.projects?.find(project => project.name === "setup")
const authedProject = webConfig.projects?.find(project => project.name === "authed")

if (!setupProject || !authedProject) {
  throw new Error("Hospital pediatric Playwright config requires the Web setup and authed projects")
}

// The Web tree is vendored and provenance-checked byte-for-byte. This config
// reuses its real servers, database setup and authenticated project while the
// Hospital-owned release regression stays outside apps/web.
export default {
  ...webConfig,
  testDir: ".",
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
