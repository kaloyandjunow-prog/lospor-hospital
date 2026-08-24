# LOSPOR Database

Standalone read-only research, quality-improvement, and benchmarking interface
for LOSPOR.

The application never connects directly to PostgreSQL. It uses the versioned
LOSPOR API for authentication, governed cohort queries, pseudonymous case
inspection, quality reports, saved cohorts, benchmarks, and exports.

The 1.2.0 release is coordinated with the matching LOSPOR API and Core release;
do not mix it with an older research contract.

The Browser is not a permission manager. It consumes live, granular grants
issued by the Hospital Status operator surface. A clinical account may request
the API's tightly limited eight-hour aggregate-only self-authorization, but
case inspection, export, OMOP, and sharing always require an explicit grant.
All case navigation uses research pseudonyms rather than operational IDs.

Saved cohorts may be run by anybody whose grant makes them visible and may be
duplicated by accounts allowed to save private cohorts. Editing and deletion
are deliberately narrower: the Browser compares the signed-in user ID with the
cohort's owner ID and offers those mutations only to the exact owner. An owner
whose institution-sharing permission was revoked can retain the shared cohort
or make it private without an unrelated metadata edit silently changing its
visibility.

Owners can edit both metadata and the complete API-supported filter definition.
The editor round-trips exact dates, multiple statuses/modes/sex values, every
range and structured clinical filter currently in the shared contract, and
preserves unknown future filter properties. Updates carry the last observed
`updatedAt`; an intervening edit returns a conflict and must be reloaded instead
of silently overwriting newer work.

Unauthenticated workspace navigation records a strictly validated relative
return path. Successful sign-in returns to that research screen; unsafe or
non-workspace destinations fall back to `/overview`. Sign-out is considered
successful only after the API has revoked and expired the HttpOnly session.

The login form, research-context panel, legal links, document metadata, and
browser title all use the same Bulgarian-first locale provider. The prominent
Bulgarian/English selector updates the entire rendered login surface and the
device preference; after authentication the account locale is authoritative.

## Local development

1. Start PostgreSQL and `lospor-api` on port `3002`.
2. Apply API migrations with `npx prisma migrate deploy`.
3. Configure `.env.local` from `.env.example`.
4. Run `npm ci`.
5. Run `npm run dev` and open `http://localhost:3003`.

The first release reads normalized LOSPOR data. Its API contract identifies the
data source so a central OMOP provider can later serve the same interface.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The application is licensed under AGPL-3.0-or-later.
