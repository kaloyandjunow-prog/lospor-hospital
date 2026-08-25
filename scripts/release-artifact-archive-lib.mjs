const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function expectedFixed(version, phase) {
  const prefix = `lospor-hospital-${version}`
  const names = [
    `${prefix}-deployment.tar.gz`,
    `${prefix}-manifest.json`,
    `${prefix}-release.lock`,
    `${prefix}-release.lock.sha256`,
    `${prefix}-security-evidence.tar.gz`,
  ]
  if (phase === "candidate") names.push(`${prefix}-images.json`, `${prefix}-publication-request.tsv`)
  else if (phase === "final") names.push(`${prefix}-release.lock.sig`)
  else throw new Error("artifact phase must be candidate or final")
  return names
}

export function verifyActionsArtifactArchive({ version, phase, membersText, listingText }) {
  if (typeof version !== "string" || !VERSION.test(version)) throw new Error("artifact version is invalid")
  if (typeof membersText !== "string" || !membersText.endsWith("\n") || membersText.includes("\r")) {
    throw new Error("artifact member list is not canonical LF text")
  }
  const members = membersText.slice(0, -1).split("\n")
  if (members.length < expectedFixed(version, phase).length + 1
    || members.some(name => !name || name.startsWith("-") || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))) {
    throw new Error("artifact contains an unsafe or incomplete member list")
  }
  if (new Set(members).size !== members.length) throw new Error("artifact contains duplicate members")

  const prefix = `lospor-hospital-${version}`
  const fixed = new Set(expectedFixed(version, phase))
  const parts = []
  for (const name of members) {
    if (fixed.delete(name)) continue
    const match = name.match(new RegExp(`^${prefix.replaceAll(".", "\\.")}-images\\.tar\\.gz\\.part-([0-9]{3})$`))
    if (!match) throw new Error(`artifact contains an unexpected member: ${name}`)
    parts.push(Number(match[1]))
  }
  if (fixed.size) throw new Error(`artifact is missing required members: ${[...fixed].join(", ")}`)
  parts.sort((left, right) => left - right)
  if (parts.length < 1 || parts.length > 999 || parts.some((part, index) => part !== index)) {
    throw new Error("artifact offline image parts are not contiguous from part-000")
  }

  if (typeof listingText !== "string") throw new Error("artifact ZIP metadata listing is missing")
  const listingLines = listingText.replaceAll("\r\n", "\n").split("\n")
  for (const member of members) {
    const matches = listingLines.filter(line => line.endsWith(` ${member}`))
    if (matches.length !== 1 || !matches[0].startsWith("-")) {
      throw new Error(`artifact member is not one regular file: ${member}`)
    }
  }
  return Object.freeze([...members].sort())
}
