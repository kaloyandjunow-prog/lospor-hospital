# LOSPOR Web

[![Licence: AGPL-3.0](https://img.shields.io/badge/Licence-AGPL--3.0-blue.svg)](LICENSE)
[![Live app](https://img.shields.io/badge/Live-app.lospor.org-green)](https://app.lospor.org)
[![Docs](https://img.shields.io/badge/Docs-docs.lospor.org-blue)](https://docs.lospor.org)

Copyright (C) 2026 Kaloyan Dzhunov. Licensed under AGPL-3.0.

This repository contains the LOSPOR Next.js browser interface. LOSPOR is a
free, open-source personal anaesthetic case log for learning, portfolio, and
reflection. It is available in English and Bulgarian.

Database access, authentication, email, AI, PDF generation, audit, OMOP, and
HTTP behavior live in the separate `lospor-api` repository. Framework-free
clinical rules and synchronization contracts live in `@lospor/core`.

## What LOSPOR is

LOSPOR records de-identified perioperative cases, provides preoperative,
intraoperative, and postoperative workflows, and generates printable case
summaries. It is not a patient management system or certified medical device,
and it does not replace clinical judgment.

## Local development

Start `lospor-api` first on port 3002. Then:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The web interface listens on `http://localhost:3000`.

```env
LOSPOR_API_INTERNAL_URL="http://localhost:3002"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

The temporary `/api/*` compatibility address forwards V6 client requests to
API `/v1/*`. No API route implementation or Prisma code belongs in this repo.

## Checks

```bash
npm run verify:boundaries
npm run test
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

## Deployment

Deploy this repository as the web project, normally at `app.lospor.org`.
Deploy `lospor-api` separately, normally at `api.lospor.org`. Web must not
receive database credentials or the API signing secret.

See the [self-hosting guide](https://docs.lospor.org/self-hosting) for database,
API, migration, seed, cron, and deployment instructions.

## Tech stack

Next.js 16, React 19, Tailwind CSS, next-intl, LOSPOR Core, and Vercel
Analytics.

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).
