# Supabase migration

Target project: `ahzpuefosoajwwgbfhng`. The frontend uses its public publishable key in `supabase-config.js`; that key is not a password. GitHub Pages serves the application and Supabase Auth, PostgreSQL and the `ontology` Edge Function provide private, editable workspaces. No Firebase deployment is involved.

## Current status

The code is migrated and tested locally. Applying the remote schema, deploying the Edge Function, and moving the original data require access to the live project. The cloud onboarding SQLite database is empty; it is not a copy of the original computer's data. Do not describe an empty account as a successful data migration.

## Deploy

Requires Node 25.8.2 or newer. From the repository root:

```sh
npm ci
npm run build:supabase
node scripts/deploy-supabase.js
npm run build:cloud
```

Set `SUPABASE_ACCESS_TOKEN` securely before running the deployment script. Obtain a personal access token with access to this project through your Supabase account settings. Do not commit it, put it in browser configuration, or paste it into chat. The script uses the Supabase Management API, applies the schema in a transaction, and deploys the Edge Function. It refuses an unknown existing `pm` schema and recognizes its own migration on repeated runs. Schema changes and function deployment are separate remote operations; a failed function deployment may leave the schema successfully installed, and retrying is safe.

The function uses Supabase's injected `SUPABASE_DB_URL` and public keys. It verifies every access token against Supabase Auth before opening a database transaction. Gateway JWT verification is disabled to support publishable keys; the function's own user authentication is mandatory. Database queries run as `authenticated` under the verified user's identity, with row-level security. Database credentials and service-role keys never enter the browser.

In Supabase Authentication, enable Email/password and set the Site URL to `https://louiscxcix.github.io/lspm/`. Email confirmations use the project's email delivery settings; check their rate limits before inviting users. Sign up and confirm the account, then sign in. Accounts currently have independent private workspaces; team sharing/invitations are not implemented.

The allowed browser origin defaults to `https://louiscxcix.github.io`. For another frontend, set the Edge Function secret `PM_ALLOWED_ORIGINS` to a comma-separated list of exact origins. No wildcard is accepted by the implementation. Optional AI extraction requires the Edge Function secret `GEMINI_API_KEY`; ordinary saves and CSV input do not require it.

## GitHub delivery

The workflow `.github/workflows/supabase.yml` tests PostgreSQL and the app. On `main`, it deploys the backend before publishing the cloud frontend. Configure the repository Actions secret `SUPABASE_ACCESS_TOKEN` and set Settings → Pages → Source to **GitHub Actions**. Then merge the migration branch to `main` or run the workflow on `main`. API access to GitHub is not required for a native Git push, but is needed to configure these repository settings automatically.

`build:cloud` copies application assets only; it never opens SQLite or publishes project records. The older `build-public.js` remains available for explicit read-only snapshot exports and is not used by this workflow.

## Import the original data

First make a backup on the computer holding the real SQLite database. Stop that local server while exporting, or use its existing **Export all data** button. The command below reads SQLite without modifying it and refuses to overwrite the destination file:

```sh
node scripts/export-sqlite.js /absolute/path/ontology.sqlite /private/path/ontology-backup.json
```

After creating the Supabase account, copy its UUID from Authentication → Users. Obtain the project's PostgreSQL connection string from Connect, preserving TLS certificate verification, and supply it through a secure `PM_DATABASE_URL` environment variable:

```sh
node scripts/import-supabase.js /private/path/ontology-backup.json SUPABASE_AUTH_USER_UUID
```

The importer requires an empty target account. It preserves object/project IDs, memberships, relationships, project assessments and schedules, workstreams, sources, AI review records, WIP/staffing observations, change history, and revision. All rows and validation commit atomically; a failure rolls everything back. It never modifies the original SQLite file. Keep exported files private: they include source document bytes. The authenticated `/api/import` endpoint supports the same backup format for integrations, with a 16 MB request limit; use the command-line importer for larger backups.

After importing, sign in, inspect real projects and relations, export again, and compare counts/source bytes. Only then treat the original data as migrated. Changes in the local SQLite app do not automatically synchronize with Supabase; use the online app after cutover.

## Verification

```sh
npm test
npm run build:supabase
npm run build:cloud
```

For PostgreSQL integration tests, initialize an empty disposable PostgreSQL 17 database with `supabase/test-bootstrap.sql`, then apply the migration. Set `TEST_DATABASE_URL` to that test database before `npm test`. Never run the test bootstrap against Supabase. Tests verify user isolation, cross-user foreign-key rejection, concurrent revision conflicts, project-specific schedules, history/revert, WIP, retained source bytes and atomic backup imports. The browser test uses Chromium (`CHROME_PATH` override), a simulated Auth service and the real shared API/store; it does not establish live Supabase readiness.

The Edge bundle can be imported in Deno. To type-check the entrypoint, use Deno 2 with `deno check --node-modules-dir=auto --no-lock supabase/functions/ontology/index.ts`. In a proxy environment, use the system CA store through `DENO_TLS_CA_STORE=system,mozilla`; do not disable certificate verification.

The pre-existing `node test.js` CSS version assertion failure is separate from this migration. Its regex expects a numeric suffix, whereas the checked-in stylesheet version ends in `mobile`.

## Free-plan limits

Ontology rows, history and retained source bytes currently live in PostgreSQL, so they count toward the 500 MB database quota. This migration preserves the existing source-byte behavior; it does not yet move documents to Supabase Storage. Use modest uploads and monitor database size. Moving large documents to private Storage is a future improvement. The backend still loads complete workspaces and records row diffs for change review, so large datasets increase memory and bandwidth use. Edge Functions have a 256 MB memory limit and limited CPU time; large XLSX workbooks need a representative live test before relying on them operationally. The existing 10 MB upload limit is not a guarantee every workbook fits those compute limits.

Free projects can pause for low activity. Maintain independent database and source-file backups. Use a paid plan if continuous factory availability is required.
