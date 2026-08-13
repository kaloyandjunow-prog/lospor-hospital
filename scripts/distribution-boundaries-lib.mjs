const privatePathPatterns = [
  /(^|\/)\.data(?:\/|$)/,
  /(^|\/)\.npm-cache-status(?:\/|$)/,
  /(^|\/)secrets\/(?!\.gitkeep$)/,
  /(^|\/)backups\/(?!\.gitkeep$)/,
  /(^|\/)\.auth\/(?!\.gitkeep$)/,
  /(^|\/)(?:playwright-report|test-results)(?:\/|$)/,
  /(^|\/)(?:cookies?|cookie-jar)(?:\.[^\/]*)?$/i,
  /(^|\/)[^\/]*(?:credential|secret|token|password|session)[^\/]*\.json$/i,
  /(^|\/)(?:backup|dump|snapshot|export)(?:[-_.][^\/]*)?\.sql$/i,
  /\.(?:dump|backup|bak|db|sqlite|sqlite3|sqlite-(?:wal|shm)|sqlite3-(?:wal|shm)|p12|pfx|key)$/i,
]

export function distributionBoundaryProblems(paths, contents = new Map()) {
  const problems = []
  for (const rawPath of paths) {
    const path = rawPath.replaceAll("\\", "/")
    if (privatePathPatterns.some(pattern => pattern.test(path))) {
      problems.push(`${path} is private runtime/test material and must not be tracked`)
    }
    if ((/(^|\/)\.env(?:\.|$)/.test(path) || /\.env$/i.test(path)) && !path.endsWith(".env.example")) {
      problems.push(`${path} is an environment file and must not be tracked`)
    }
    const content = contents.get(rawPath) ?? contents.get(path)
    if (typeof content === "string" && /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(content)) {
      problems.push(`${path} contains a private key`)
    }
    if (
      typeof content === "string"
      && /(^|\/)\.npmrc$/i.test(path)
      && /(?:^|\n)\s*(?:(?:\/\/[^\n=]+\/)?[:]?_auth(?:Token)?|username|password|email|always-auth)\s*=/im.test(content)
    ) {
      problems.push(`${path} contains npm registry credentials or authentication settings`)
    }
  }
  return problems
}
