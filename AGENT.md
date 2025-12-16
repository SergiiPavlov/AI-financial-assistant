Project

AI Financial Assistant (Voice Finance Agent) — Node.js + TypeScript + Express API + Prisma + PostgreSQL, with a developer demo UI (public/demo.html + public/demo.js).

Objectives

Keep the system reproducible on a clean machine and in CI.

Prefer code/PR fixes over manual terminal “hotfixes”.

Maintain secure auth and data ownership rules across all finance endpoints.

Maintain the demo UI as a thin developer panel (no frameworks yet), but keep it maintainable.

Non-Negotiable Rules

No manual-only fixes. Terminal is for diagnostics; all fixes must be committed.

No secrets in git. Update .env.example and README; secrets go to environment/CI settings.

If package.json changes dependencies, update and commit lockfile.

Any Prisma schema change must include:

a migration,

Prisma client generation stability (postinstall/prebuild or equivalent).

Finance data must always be scoped to the authenticated user (never accept userId from the client).

Required Commands (must pass in PR)

npm ci

npx prisma generate

npm run build

(when DB is available) npx prisma migrate deploy

Prisma/Build Reliability

Ensure Prisma Client is generated automatically:

Add/keep "postinstall": "prisma generate"

Add/keep "prebuild": "prisma generate"

Provide scripts:

db:migrate → prisma migrate deploy

db:status → prisma migrate status

optional doctor → checks env + Prisma client generation

Auth & Security

Access token + refresh token flow must remain intact.

Refresh token revocation uses tokenVersion; never regress this.

All finance routes must return correct status codes:

401 for unauthenticated,

403 for ownership violations (if used),

400 for validation issues (not 500).

Finance Domain Rules

Transactions support type: income | expense.

Aggregations:

totals must represent the actual period (incomeTotal, expenseTotal, balance).

analytics breakdown may be type-filtered, but totals must stay correct.

Idempotency:

bulk/AI imports must remain idempotent (batchId behavior preserved).

Drafts:

GET must be lenient (do not break old persisted drafts),

create/update/apply must be strictly validated.

Demo UI Rules

demo.html should be mostly markup + i18n dictionary.

All logic lives in public/demo.js.

Avoid inline megascripts.

UI should not crash on auth/logout; errors should be shown clearly.

PR Format

Each PR must include:

Summary (what changed)

Testing (commands run + results)

Notes (env requirements, migrations, any behavior changes)

What to Do When a Problem Appears

Reproduce with npm ci && npm run build.

If Prisma-related, run npx prisma generate and npx prisma migrate status.

Fix via code/scripts (not manual state changes).

Update README/.env.example if required.
