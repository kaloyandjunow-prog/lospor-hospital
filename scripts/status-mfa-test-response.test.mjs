import assert from "node:assert/strict"
import { test } from "node:test"
import { responseBodyFromEnrollmentPage } from "./status-mfa-test-response.mjs"

test("turns an enrollment page into a second-step form without returning the seed", () => {
  const html = '<input name="challengeToken" value="challenge-value"><div class="secret">GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ</div>'
  const response = responseBodyFromEnrollmentPage(html, 59_000)
  assert.equal(response, "challengeToken=challenge-value&code=287082")
  assert.doesNotMatch(response, /GEZDGNBV/)
})

test("fails closed when the enrollment page is incomplete", () => {
  assert.throws(() => responseBodyFromEnrollmentPage("<html></html>"), /STATUS_MFA_TEST_PAGE_INVALID/)
})
