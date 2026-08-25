import { describe, expect, it } from "vitest"
import bg from "../../messages/bg.json"
import en from "../../messages/en.json"

describe("Hospital username copy", () => {
  it.each([
    ["English", en.auth],
    ["Bulgarian", bg.auth],
  ])("ships every required rule in %s", (_language, auth) => {
    expect(auth.username).toBeTruthy()
    expect(auth.usernameRequirements).toMatch(/3.{0,5}64/)
    expect(auth.usernameRequirements).toContain("A–Z/a–z")
    expect(auth.usernameRequirements).toContain("@")
    expect(auth.usernameRequirements).toContain("/")
    expect(auth.usernameRequirements).toContain("\\")
    expect(auth.usernameCasePolicy).toBeTruthy()
    expect(auth.usernameDisplayNamePolicy).toBeTruthy()
    expect(auth.registrationAdministratorOnly).toBeTruthy()
    expect(auth.passwordRecoveryAdministratorOnly).toBeTruthy()
  })

  it("states the preservation and comparison policy plainly in English", () => {
    expect(en.auth.usernameCasePolicy).toContain("capitalization is preserved")
    expect(en.auth.usernameCasePolicy).toContain("matching and uniqueness are case-insensitive")
    expect(en.auth.usernameDisplayNamePolicy).toContain("Cyrillic")
  })

  it("states the same policy plainly in Bulgarian", () => {
    expect(bg.auth.usernameCasePolicy).toContain("Изписването се запазва")
    expect(bg.auth.usernameCasePolicy).toContain("проверката за уникалност")
    expect(bg.auth.usernameCasePolicy).toContain("не различават главни от малки букви")
    expect(bg.auth.usernameDisplayNamePolicy).toContain("кирилица")
  })
})
