function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message)
}

function jobBlock(workflow, name) {
  const marker = `\n  ${name}:\n`
  const start = workflow.indexOf(marker)
  if (start < 0) throw new Error(`CI workflow has no ${name} job`)

  const bodyStart = start + marker.length
  const nextJob = /^  [a-z0-9_-]+:\s*$/gm
  nextJob.lastIndex = bodyStart
  const next = nextJob.exec(workflow)
  return workflow.slice(bodyStart, next?.index ?? workflow.length)
}

/**
 * Proves that the already-required Web E2E status cannot pass without running
 * the exact two-client intraoperative scenario against real sibling clients.
 * This is deliberately a narrow text contract: parsing YAML would add a CI-only
 * dependency and would still not prove the command selected the intended spec.
 */
export function assertCrossAppCiContract(workflow) {
  requirePattern(workflow, /push:\s*\n\s*branches:\s*\[main\]/, "CI must run on main")
  requirePattern(workflow, /\n\s*pull_request:\s*(?:\n|$)/, "CI must run for pull requests")

  const job = jobBlock(workflow, "e2e")
  requirePattern(job, /timeout-minutes:\s*(?:[6-9]\d|\d{3,})\b/, "Web E2E must allow at least 60 minutes")
  requirePattern(job, /services:\s*\n\s*postgres:/, "Web E2E must use disposable PostgreSQL")
  requirePattern(
    job,
    /repository:\s*kaloyandjunow-prog\/lospor-api[\s\S]{0,120}ref:\s*main[\s\S]{0,120}path:\s*lospor-api/,
    "Web E2E must check out the current owner API",
  )
  requirePattern(
    job,
    /repository:\s*kaloyandjunow-prog\/lospor-mobile[\s\S]{0,120}ref:\s*main[\s\S]{0,120}path:\s*lospor-mobile/,
    "Cross-app E2E must check out the current owner Mobile/PWA",
  )
  for (const repository of ["lospor-app", "lospor-api", "lospor-mobile"]) {
    requirePattern(
      job,
      new RegExp(`run:\\s*npm ci\\s*\\n\\s*working-directory:\\s*${repository}`),
      `Cross-app E2E must clean-install ${repository}`,
    )
  }
  requirePattern(
    job,
    /working-directory:\s*lospor-api[\s\S]{0,100}npx prisma generate[\s\S]{0,100}npx prisma migrate deploy/,
    "Cross-app E2E must migrate the disposable API database",
  )
  requirePattern(job, /run:\s*npm run e2e\s*(?:\n|$)/, "Web E2E must retain the ordinary suite")
  requirePattern(
    job,
    /run:\s*npm run e2e:crossapp -- e2e\/intraop-across-apps\.crossapp\.spec\.ts\s*(?:\n|$)/,
    "Web E2E must execute the exact two-client intraoperative scenario",
  )
  if (job.indexOf("npm run e2e:crossapp") < job.indexOf("npm run e2e\n")) {
    throw new Error("Cross-app E2E must run after the ordinary Web suite")
  }
  if (/continue-on-error:\s*true/.test(job)) {
    throw new Error("Web and cross-app E2E must fail closed")
  }
  requirePattern(job, /if:\s*failure\(\)[\s\S]{0,160}actions\/upload-artifact@v7/, "Web E2E must retain failure diagnostics")
  return true
}
