import { describe, expect, it } from "vitest"
import { parseUpdateAgentSignal, updateAgentObservation } from "./signals"
import { CODE_MESSAGE } from "./ui"

// The host agent's own signal.
//
// Two signals rather than one: appliance-update says what has been published,
// update-agent says whether anything is acting on it. Folded together, a dead
// agent would hide behind a healthy release row — and the whole premise of the
// agent is that nobody is watching it.

const NOW = Date.parse("2026-08-20T12:00:00Z")
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

const signal = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  signalType: "update-agent",
  observedAt: at(-1_000),
  phase: "idle",
  ...over,
})

describe("reading the update agent's signal", () => {
  it("accepts a heartbeat", () => {
    expect(parseUpdateAgentSignal(signal(), NOW)).toMatchObject({ phase: "idle" })
  })

  it("carries what it is working on", () => {
    expect(parseUpdateAgentSignal(
      signal({ phase: "applying", targetVersion: "1.3.0" }), NOW,
    )).toMatchObject({ phase: "applying", targetVersion: "1.3.0" })
  })

  // A queued update is due in the future by definition. An observation in the
  // future is nonsense; a schedule in the future is the point.
  it("allows a schedule in the future but not an observation", () => {
    expect(parseUpdateAgentSignal(
      signal({ phase: "queued", scheduledFor: at(8 * 60 * 60_000) }), NOW,
    )).toMatchObject({ phase: "queued" })
    expect(parseUpdateAgentSignal(signal({ observedAt: at(60 * 60_000) }), NOW)).toBeNull()
  })

  it("refuses another signal's payload", () => {
    expect(parseUpdateAgentSignal(signal({ signalType: "backup" }), NOW)).toBeNull()
    expect(parseUpdateAgentSignal(signal({ schemaVersion: 2 }), NOW)).toBeNull()
  })

  it("refuses a phase it does not know", () => {
    expect(parseUpdateAgentSignal(signal({ phase: "rebooting" }), NOW)).toBeNull()
  })

  it("refuses unexpected keys", () => {
    // A signal is written by a shell script on the host. Accepting extra keys
    // would let a malformed write pass as a well-formed one.
    expect(parseUpdateAgentSignal(signal({ extra: "x" }), NOW)).toBeNull()
  })

  it("refuses a version or code that is not shaped like one", () => {
    expect(parseUpdateAgentSignal(signal({ targetVersion: "latest" }), NOW)).toBeNull()
    expect(parseUpdateAgentSignal(signal({ resultCode: "went wrong" }), NOW)).toBeNull()
  })
})

describe("what the agent's row says", () => {
  it("says nothing at all when no agent is installed", () => {
    // A site running the older arrangement never asked for an agent. Inventing
    // a red row for it would be an alarm about something absent on purpose.
    expect(updateAgentObservation(null, NOW)).toBeNull()
  })

  // The reason this row exists. Without it a dead agent is invisible until
  // UPDATE_CHECK_STALE at fourteen days.
  it("degrades when the heartbeat stops", () => {
    const stale = parseUpdateAgentSignal(signal({ observedAt: at(-11 * 60_000) }), NOW)
    expect(updateAgentObservation(stale, NOW)).toMatchObject({
      status: "degraded", code: "UPDATE_AGENT_UNAVAILABLE",
    })
  })

  it("stays operational while an update is under way", () => {
    for (const phase of ["accepted", "queued", "preparing", "applying", "completed"]) {
      expect(updateAgentObservation(parseUpdateAgentSignal(signal({ phase }), NOW), NOW))
        .toMatchObject({ status: "operational" })
    }
  })

  // A half-applied release is the one situation that must shout: the appliance
  // may be between two versions and only a person can resolve it.
  it("treats a half-applied release as an outage", () => {
    expect(updateAgentObservation(
      parseUpdateAgentSignal(signal({ phase: "needs-operator" }), NOW), NOW,
    )).toMatchObject({ status: "outage" })
  })

  it("degrades on a failure and names it", () => {
    expect(updateAgentObservation(
      parseUpdateAgentSignal(signal({ phase: "failed", resultCode: "UPDATE_HEALTH_GATE_FAILED" }), NOW), NOW,
    )).toMatchObject({ status: "degraded", code: "UPDATE_HEALTH_GATE_FAILED" })
  })
})

describe("every code the agent can show", () => {
  // A code with no message renders on the page as a bare identifier, which is
  // exactly what the status page exists not to do.
  it("has something a person can read", () => {
    const phases = ["idle", "accepted", "queued", "preparing", "applying", "completed"] as const
    const codes = phases.map(phase =>
      updateAgentObservation(parseUpdateAgentSignal(signal({ phase }), NOW), NOW)?.code)
    codes.push("UPDATE_AGENT_UNAVAILABLE", "UPDATE_NEEDS_OPERATOR", "UPDATE_FAILED")

    const missing = codes.filter(code => code && !CODE_MESSAGE[code])
    expect(missing, "codes with no plain-English message").toEqual([])
  })
})
