# @lospor/core

Shared pure-TypeScript clinical logic for [LOSPOR](https://github.com/kaloyandjunow-prog/lospor-app) — the Large Open Source Perioperative Register.

This package contains framework-free logic used by the [API](https://github.com/kaloyandjunow-prog/lospor-api), [web app](https://github.com/kaloyandjunow-prog/lospor-app), [mobile/PWA app](https://github.com/kaloyandjunow-prog/lospor-mobile), and [Database Browser](https://github.com/kaloyandjunow-prog/lospor-browser): dose calculation, clinical scores, unit conversion, numeric ranges, timetable math, risk derivation, ASA suggestion, option-library mappers, intraop vitals/totals helpers, OMOP helpers, ventilation mode lists, the intraop complications taxonomy, and canonical case-status labels (English + Bulgarian).

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
