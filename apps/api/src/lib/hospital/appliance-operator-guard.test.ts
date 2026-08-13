import { describe, expect, it } from "vitest"
import { applianceOperatorBlocksMutation, type ApplianceOperatorMutation } from "./appliance-operator-guard"

describe("appliance operator mutation guard", () => {
  const mutations: ApplianceOperatorMutation[] = [
    "PASSWORD_RESET",
    "SELF_DELETE",
    "ADMIN_DELETE",
    "DEMOTE",
  ]

  it.each(mutations)("blocks %s for the designated operator", mutation => {
    expect(applianceOperatorBlocksMutation(true, mutation)).toBe(true)
  })

  it.each(mutations)("does not affect ordinary accounts for %s", mutation => {
    expect(applianceOperatorBlocksMutation(false, mutation)).toBe(false)
  })
})
