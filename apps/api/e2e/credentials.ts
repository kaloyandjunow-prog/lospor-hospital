// Shared local E2E credentials for API seed and smoke scripts.
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@lospor.test"
export const E2E_USERNAME = process.env.E2E_USERNAME ?? "E2E.Admin"
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234"
export const E2E_RESEARCH_EMAIL = process.env.E2E_RESEARCH_EMAIL ?? "research-e2e@lospor.test"
export const E2E_RESEARCH_USERNAME = process.env.E2E_RESEARCH_USERNAME ?? "E2E.Research"

// A cast rather than a single account: the institution, visibility and
// approval rules only mean anything with more than one person in the room, and
// with two institutions to keep separate.
//
// E2E_EMAIL above is the ADMIN, in E2E_INSTITUTION_A.
export const E2E_HOD_A_EMAIL    = process.env.E2E_HOD_A_EMAIL    ?? "hod-a-e2e@lospor.test"
export const E2E_HOD_A_USERNAME = process.env.E2E_HOD_A_USERNAME ?? "Hod-A-E2E"
export const E2E_MEMBER_A_EMAIL = process.env.E2E_MEMBER_A_EMAIL ?? "member-a-e2e@lospor.test"
export const E2E_MEMBER_A_USERNAME = process.env.E2E_MEMBER_A_USERNAME ?? "Member-A-E2E"
// A second member inside institution A, so a case can be handed along a chain
// -- registrar to consultant to whoever is actually on the list -- without
// doubling back through the same two people.
export const E2E_MEMBER_A2_EMAIL = process.env.E2E_MEMBER_A2_EMAIL ?? "member-a2-e2e@lospor.test"
export const E2E_MEMBER_A2_USERNAME = process.env.E2E_MEMBER_A2_USERNAME ?? "Member-A2-E2E"
export const E2E_HOD_B_EMAIL    = process.env.E2E_HOD_B_EMAIL    ?? "hod-b-e2e@lospor.test"
export const E2E_HOD_B_USERNAME = process.env.E2E_HOD_B_USERNAME ?? "Hod-B-E2E"
export const E2E_MEMBER_B_EMAIL = process.env.E2E_MEMBER_B_EMAIL ?? "member-b-e2e@lospor.test"
export const E2E_MEMBER_B_USERNAME = process.env.E2E_MEMBER_B_USERNAME ?? "Member-B-E2E"

export const E2E_INSTITUTION_A = "e2e-institution"
export const E2E_INSTITUTION_B = "e2e-institution-b"
