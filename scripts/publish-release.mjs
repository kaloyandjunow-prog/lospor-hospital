#!/usr/bin/env node
// Publish a LOSPOR Hospital release in two steps, from the maintainer's machine.
//
//   node scripts/publish-release.mjs prepare <candidate-run-id>
//     Reads the successful candidate run, downloads its candidate into a new
//     directory, verifies it, and prints the one command to run on the offline
//     signing machine.
//
//   node scripts/publish-release.mjs publish <candidate-run-id>
//     Checks the signature brought back against the committed public key, that
//     Immutable Releases is on, and that the release is not already published;
//     asks for PUBLISH hospital-X.Y.Z; and starts publish-release.yml with its
//     three inputs.
//
// It never signs and never sees the private key: signing stays on the offline
// machine, and only the public .sig comes back. It uses the maintainer's own gh
// login, which can read the Immutable Releases setting the workflow token
// cannot. The workflow checks everything again on its own.

import { spawnSync } from "node:child_process"
import { createHash, createPublicKey, verify } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

export const REPOSITORY = "kaloyandjunow-prog/lospor-hospital"
const VERSION_TAG = /^hospital-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function refuse(message) {
  throw Object.assign(new Error(message), { refusal: true })
}

function json(text, what) {
  try {
    return JSON.parse(text)
  } catch {
    refuse(`GitHub returned something that is not JSON for ${what}.`)
  }
}

/** The candidate run, and everything that used to be typed, derived from it. */
export function readCandidate(runId, { gh }) {
  if (!/^[1-9]\d*$/.test(String(runId ?? ""))) refuse("Give the candidate run ID: the number in the Actions run URL.")
  const run = json(gh(["api", `repos/${REPOSITORY}/actions/runs/${runId}`]), "the run")
  if (run.repository?.full_name !== REPOSITORY) refuse(`Run ${runId} is not a ${REPOSITORY} run.`)
  if (run.event !== "push") refuse(`Run ${runId} was not started by pushing a release tag.`)
  if (run.conclusion !== "success") refuse(`Run ${runId} did not succeed (${run.conclusion ?? run.status}). Only a successful candidate can be published.`)
  const tag = VERSION_TAG.exec(run.head_branch ?? "")
  if (!tag) refuse(`Run ${runId} was not built from a hospital-X.Y.Z tag.`)
  if (!/^[a-f0-9]{40}$/.test(run.head_sha ?? "") || !Number.isInteger(run.run_attempt) || run.run_attempt < 1) {
    refuse(`Run ${runId} does not report a commit and attempt.`)
  }
  const workflowPath = gh(["api", `repos/${REPOSITORY}/actions/workflows/${run.workflow_id}`, "--jq", ".path"]).trim()
  if (workflowPath !== ".github/workflows/release.yml") refuse(`Run ${runId} is not a release.yml candidate run.`)
  let reference = json(gh(["api", `repos/${REPOSITORY}/git/ref/tags/${tag[0]}`]), "the tag")
  while (reference.object?.type === "tag") {
    reference = json(gh(["api", `repos/${REPOSITORY}/git/tags/${reference.object.sha}`]), "the tag object")
  }
  if (reference.object?.type !== "commit" || reference.object.sha !== run.head_sha) {
    refuse(`${tag[0]} no longer points at the commit run ${runId} built. That candidate cannot be published.`)
  }
  const version = tag[1]
  const attempt = run.run_attempt
  return {
    runId: String(runId),
    attempt,
    version,
    tag: tag[0],
    commit: run.head_sha,
    artifactName: `hospital-${version}-${runId}-${attempt}-candidate`,
    directory: `candidate-${version}-${runId}-${attempt}`,
    lockName: `lospor-hospital-${version}-release.lock`,
  }
}

function lockDigest(directory, candidate) {
  const lockPath = join(directory, candidate.lockName)
  if (!existsSync(lockPath)) refuse(`${candidate.lockName} is not in ${directory}. Run prepare first.`)
  const lock = readFileSync(lockPath)
  const digest = createHash("sha256").update(lock).digest("hex")
  const sidecar = readFileSync(`${lockPath}.sha256`, "utf8")
  if (sidecar !== `${digest}  ${candidate.lockName}\n`) refuse(`${candidate.lockName} does not match its .sha256 sidecar. Download the candidate again into a new directory.`)
  return { lockPath, lock, digest }
}

export function prepare(runId, deps) {
  const { gh, node, say, cwd } = deps
  const candidate = readCandidate(runId, deps)
  const directory = resolve(cwd, candidate.directory)
  if (existsSync(directory) && readdirSync(directory).length > 0) {
    if (!existsSync(join(directory, candidate.lockName))) {
      refuse(`${directory} exists and is not this candidate. Move it away; files from different runs must never be combined.`)
    }
    say(`Using the candidate already downloaded in ${directory}.`)
  } else {
    say(`Downloading ${candidate.artifactName} (the whole candidate, several GB) into ${directory}...`)
    gh(["run", "download", candidate.runId, "--repo", REPOSITORY, "--name", candidate.artifactName, "--dir", directory])
  }
  node([join(root, "scripts/verify-release-candidate.mjs"), candidate.version, directory, "candidate-assets", candidate.commit])
  node([
    join(root, "scripts/verify-release-handoff.mjs"),
    join(directory, `lospor-hospital-${candidate.version}-publication-request.tsv`),
    join(directory, candidate.lockName),
    candidate.version, candidate.commit, candidate.runId, String(candidate.attempt),
  ])
  const { lockPath, digest } = lockDigest(directory, candidate)
  say("")
  say(`Candidate ${candidate.tag} is verified: run ${candidate.runId} attempt ${candidate.attempt}, commit ${candidate.commit}.`)
  say(`Release lock SHA-256: ${digest}`)
  say("")
  say("On the offline signing machine, sign exactly this file:")
  say(`  printf '%s' "$(cat /secure/offline/maintainer.key)" | sh scripts/sign-release-lock.sh ${candidate.lockName}`)
  say("")
  say(`Bring back only ${candidate.lockName}.sig, put it in ${directory}, then run:`)
  say(`  node scripts/publish-release.mjs publish ${candidate.runId}`)
  return { candidate, lockPath, digest }
}

export async function publish(runId, deps) {
  const { gh, say, prompt, cwd } = deps
  const publicKeyPath = deps.publicKeyPath ?? join(root, "infra/release-signing/release-signing-public.pem")
  const candidate = readCandidate(runId, deps)
  const directory = resolve(cwd, candidate.directory)
  const { lockPath, lock, digest } = lockDigest(directory, candidate)
  const signaturePath = `${lockPath}.sig`
  if (!existsSync(signaturePath)) refuse(`${candidate.lockName}.sig is not in ${directory}. Sign the lock on the offline machine first.`)
  const signature = readFileSync(signaturePath)
  if (signature.length !== 64) refuse(`${candidate.lockName}.sig is ${signature.length} bytes; an Ed25519 signature is exactly 64.`)
  if (!verify(null, lock, createPublicKey(readFileSync(publicKeyPath)), signature)) {
    refuse("The signature does not verify against the committed release public key for this exact lock. Was the right file signed with the right key?")
  }
  const setting = json(gh(["api", `repos/${REPOSITORY}/immutable-releases`]), "the Immutable Releases setting")
  if (setting.enabled !== true) {
    refuse("Immutable Releases is off. Turn it on in the repository's Settings → General → Releases before publishing.")
  }
  let existing = null
  try {
    existing = json(gh(["release", "view", candidate.tag, "--repo", REPOSITORY, "--json", "isDraft,isImmutable"]), "the release")
  } catch (error) {
    if (error.refusal) throw error
  }
  if (existing?.isImmutable === true) {
    say(`${candidate.tag} is already published and immutable. Nothing to do.`)
    return { dispatched: false }
  }

  const signatureBase64 = signature.toString("base64")
  const confirmation = `PUBLISH ${candidate.tag}`
  say("")
  say(`Ready to publish LOSPOR Hospital ${candidate.version}:`)
  say(`  candidate run   ${candidate.runId} (attempt ${candidate.attempt})`)
  say(`  commit          ${candidate.commit}`)
  say(`  lock SHA-256    ${digest}`)
  say(`  signature       verified against infra/release-signing/release-signing-public.pem`)
  say(`  Immutable Releases is on${existing?.isDraft ? "; an interrupted draft will be resumed" : ""}`)
  say("")
  say("Publishing promotes the ten images to public version tags and creates an immutable GitHub Release. It cannot be undone.")
  const typed = await prompt(`Type ${confirmation} to publish: `)
  if (typed !== confirmation) {
    say("Nothing was published.")
    return { dispatched: false }
  }
  gh([
    "workflow", "run", "publish-release.yml", "--repo", REPOSITORY, "--ref", "main",
    "-f", `candidate_run_id=${candidate.runId}`,
    "-f", `release_signature_base64=${signatureBase64}`,
    "-f", `confirm_publication=${confirmation}`,
  ])
  say("")
  say("Publication started. Follow it with:")
  say(`  gh run watch --repo ${REPOSITORY} "$(gh run list --repo ${REPOSITORY} --workflow publish-release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"`)
  say("When it finishes, deploy lospor.org if the installer or key files changed.")
  return { dispatched: true }
}

function realGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] })
  if (result.error) refuse("The GitHub CLI (gh) is not available. Install it and run: gh auth login")
  if (result.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} failed`)
  return result.stdout
}

function realNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" })
  if (result.status !== 0) refuse(`${args[0].split(/[\\/]/).at(-1)} refused the candidate. Nothing will be published from it.`)
}

async function realPrompt(question) {
  if (!process.stdin.isTTY) refuse("Publishing needs the confirmation typed at a terminal.")
  const reader = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await reader.question(question)).trim()
  } finally {
    reader.close()
  }
}

async function main() {
  const [command, runId, ...extra] = process.argv.slice(2)
  const deps = { gh: realGh, node: realNode, prompt: realPrompt, say: line => console.log(line), cwd: process.cwd() }
  if (extra.length > 0 || !["prepare", "publish"].includes(command)) {
    console.error("Usage: node scripts/publish-release.mjs prepare <candidate-run-id>\n       node scripts/publish-release.mjs publish <candidate-run-id>")
    process.exit(2)
  }
  try {
    if (command === "prepare") prepare(runId, deps)
    else await publish(runId, deps)
  } catch (error) {
    console.error(error.refusal ? error.message : `Stopped: ${error.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
