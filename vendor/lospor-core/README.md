# @lospor/core

Shared pure-TypeScript clinical logic for [LOSPOR](https://github.com/kaloyandjunow-prog/lospor-app) — the Large Open Source Perioperative Register.

This package contains framework-free logic used by the [API](https://github.com/kaloyandjunow-prog/lospor-api), [web app](https://github.com/kaloyandjunow-prog/lospor-app), [mobile/PWA app](https://github.com/kaloyandjunow-prog/lospor-mobile), and [Database Browser](https://github.com/kaloyandjunow-prog/lospor-browser): dose calculation, clinical scores, unit conversion, numeric ranges, timetable math, risk derivation, ASA suggestion, option-library mappers, intraop vitals/totals helpers, OMOP helpers, ventilation mode lists, the intraop complications taxonomy, and canonical case-status labels (English + Bulgarian).

## Pediatric domain

Core owns precise pediatric age, age groups, mode validation, soft vital
references, POVOC/COLDS, fasting, pain-scale selection, reviewed calculators,
research fields, and clinician-facing display terms.

`@lospor/core/clinical-rules` owns typed drug/equipment rule payloads,
validation, deterministic identities, published-preset plus approved-override
resolution, exact-age dose/equipment matching, and the storage-neutral approved
snapshot repository used by web, PWA, and mobile. The API remains responsible
for persistence, institution assignment, authentication, and approval history.

Pediatric profiles are fail-closed: a client receives no suggested dose,
equipment, ventilation, blood-volume, bleeding, or local-anaesthetic value
unless an applicable approved rule is present in the assigned institution
preset. The current manifest deliberately sets
`PEDIATRIC_PRODUCTION_READY=false`.
## Design rules

- **Pure TypeScript only** — no React, Expo, Next.js, Prisma, storage, or network code.
- Ships raw `.ts` sources (no build step). Consumers transpile it themselves (`transpilePackages` in Next.js, Metro in Expo).
- Every module is exported as a subpath, e.g. `@lospor/core/dosing`.

## Consuming

```json
"@lospor/core": "github:kaloyandjunow-prog/lospor-core#v7.3.0"
```

To release a change: commit → push → tag a new version → bump the tag reference in `lospor-api`, `lospor-app`, `lospor-mobile`, and `lospor-browser`, then refresh and verify each lockfile.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

AGPL-3.0 — see [LICENSE](LICENSE).
