// Shared E2E credentials — no imports/side-effects, so both the Playwright
// auth setup and the dev seed script can use them without pulling in Prisma.
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@lospor.test"
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234"
