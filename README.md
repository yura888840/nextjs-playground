# nextjs-playground

A Next.js App Router learning project with a React counter and Node.js health and task CRUD endpoints. All application copy is in English.

## Run locally

Requires Node.js 22+, npm, and Docker Compose (or an existing PostgreSQL database).

```sh
npm ci
cp .env.example .env.local
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Open http://localhost:3000. For production mode:

```sh
npm run build
npm start
```

## First backend task: GET /api/health

```sh
curl -i http://localhost:3000/api/health
```

Example response (the timestamp changes on every request):

```json
{"status":"ok","timestamp":"2026-09-18T12:00:00.000Z"}
```

- `app/api/health/route.js` maps the `GET` export to HTTP GET.
- It returns HTTP 200, JSON, and the current server time in UTC.
- `runtime = 'nodejs'` selects the Node.js runtime.
- `dynamic = 'force-dynamic'` and `Cache-Control: no-store` prevent a build-time or cached health response.
- Unsupported methods such as POST return 405. Next.js also supplies HEAD/OPTIONS handling.
- This is a liveness check only: it does not verify a database or external services.

The page counter remains browser-local and resets on reload.

## Second backend task: tasks CRUD

This step focuses on HTTP methods, request bodies, dynamic route parameters, and response status codes.

Tasks now persist in PostgreSQL (task 4) and are shared across application instances. The task API requires a session and limits every operation to the current owner (task 6).

| Method | Endpoint | Success |
| --- | --- | --- |
| GET | `/api/tasks` | 200 with `{ "tasks": [...], "pagination": {...} }` |
| POST | `/api/tasks` | 201 with the new task and a `Location` header |
| GET | `/api/tasks/:id` | 200 with one task |
| PATCH | `/api/tasks/:id` | 200 with the updated task |
| DELETE | `/api/tasks/:id` | 204 with an empty body |

A task has `id` (server-generated UUID), `title`, `status`, `createdAt`, and `updatedAt` (UTC timestamps). Status is `todo` by default, with `in_progress` and `done` also supported. The list defaults to creation time, then UUID, with ten tasks per page. Search, filtering, sorting and pagination are described in task 7.

POST requires a title; status is optional. PATCH accepts title, status, or both, and preserves omitted fields. Titles are trimmed and must contain 1–200 characters. Empty patches, unknown fields, invalid statuses, and non-object bodies return 422. Malformed JSON and malformed UUIDs return 400, non-JSON content types return 415, missing tasks return 404, and unsupported methods return 405. Errors use the structured format documented below. Server-owned IDs and timestamps cannot be overwritten. API responses use `Cache-Control: no-store`.

### Try it

Create a task:

```sh
curl -i -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Learn Next.js CRUD"}'
```

Copy the returned `id` and replace `TASK_ID` below:

```sh
curl http://localhost:3000/api/tasks
curl http://localhost:3000/api/tasks/TASK_ID
curl -X PATCH http://localhost:3000/api/tasks/TASK_ID \
  -H 'Content-Type: application/json' \
  -d '{"status":"done"}'
curl -i -X DELETE http://localhost:3000/api/tasks/TASK_ID
```

Open http://localhost:3000/tasks or follow **Open task manager** from the homepage. The task manager loads tasks from the API and supports creation, editing titles and statuses, and deletion with confirmation. Refresh reloads the server list. Loading and error messages are shown, and controls are disabled during requests to prevent duplicate submissions. Tasks are only updated in the UI after a successful server response; no localStorage persistence is used. You can also use curl or an API client. Shared Zod schemas validate form submissions locally and API requests independently on the server.

## Third backend task: validation

`lib/task-schema.js` is shared by the browser and server. POST requires a trimmed title (1–200 UTF-16 code units) and defaults status to `todo`. PATCH accepts title and/or status without applying defaults to omitted fields. Unknown properties and server-owned fields are rejected. Route IDs must be UUIDs. Client checks improve feedback; the server always validates independently.

Handled task API errors follow this contract:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fieldErrors": { "title": ["Enter a task title."] },
    "formErrors": []
  }
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Missing or malformed JSON body |
| 400 | `INVALID_ID` | Malformed task UUID |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST/PATCH needs `application/json` (charset is allowed) |
| 422 | `VALIDATION_ERROR` | Valid JSON that fails the schema |
| 404 | `NOT_FOUND` | Well-formed UUID with no matching task |
| 405 | `METHOD_NOT_ALLOWED` | Unsupported task route method; includes `Allow` |
| 503 | `DATABASE_UNAVAILABLE` | Storage is unconfigured or a database operation failed |

`fieldErrors` contains arrays of messages keyed by field; `formErrors` contains object-level errors such as empty PATCH or unknown keys. Invalid requests never partially modify a record. The frontend shows field errors under inputs with `aria-invalid`/`aria-describedby`, preserves drafts on rejection, and displays form errors separately. Text remains English.

This changes the earlier string error response and 400 validation status. The included frontend and HTTP tests are updated together. Health responses remain unchanged. Framework-level errors outside task handlers may use Next.js's own response format.

## Fourth backend task: PostgreSQL persistence

`lib/db.js` lazily creates one reusable `pg` connection pool per Node.js process (up to five connections). `lib/task-store.js` uses parameterized SQL, and route handlers await the store. PATCH updates only supplied columns in one statement, avoiding lost updates to omitted fields. There is no in-memory fallback. Database failures return structured HTTP 503 errors without exposing connection details. `/api/health` remains a liveness check.

`DATABASE_URL` is server-only; never prefix it with `NEXT_PUBLIC_`. The build and health-only check do not need a database. Local Docker credentials in `.env.example` are for development only. `docker compose down` retains the named volume; adding `-v` deletes it.

SQL migrations live in `migrations/`. Run `npm run db:migrate` against each database before serving requests. The runner loads `.env.local`, uses a transaction and advisory lock, records checksums, and skips applied migrations. Add new numbered migration files rather than editing applied ones. Migrations are deliberately not run during builds or HTTP requests.

### Hosted database setup

1. Create a PostgreSQL database with your preferred provider.
2. Add its connection URL as `DATABASE_URL` in Vercel project settings for **Production** (and a separate database for Preview if used). Preserve the provider's TLS parameters; do not disable certificate verification. Prefer the provider's pooled URL for serverless requests.
3. From a trusted local terminal, set `DATABASE_URL` to that database and run `npm run db:migrate`. If the provider requires a direct connection for migrations, use its direct URL for this command. Shell environment values override `.env.local`.
4. Run the existing manual deployment workflow. Setting a new Vercel environment variable requires redeployment.

The GitHub workflow provisions only an ephemeral test database. It does not create or migrate the hosted database. No hosted credentials are committed or required by PR checks.

## Fifth backend task: accounts and sessions

Open `/account` to register, sign in, view the current account, or sign out. Email addresses are normalized to lowercase. Passwords are 15–128 characters and are never trimmed. Zod validates both forms and server requests. Task ownership and role checks are described in task 6 below.

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/api/auth/register` | 201, new account and session |
| POST | `/api/auth/login` | 200, new session; incorrect credentials return 401 |
| POST | `/api/auth/logout` | 204, revoke current session and clear cookie |
| GET | `/api/auth/me` | 200 with public user data, or 401 |

Apply `002_auth.sql` with `npm run db:migrate` before deployment. Passwords use Node.js scrypt with a random salt (N=131072, r=8, p=1). Session tokens contain 32 random bytes; only their SHA-256 hashes are stored in PostgreSQL. Sessions expire after seven days and successful sign-in rotates the current browser session. Logout revokes the session in the database. Cookies use HttpOnly, SameSite=Lax, Path=/, and Secure with a `__Host-` prefix in production. Use HTTPS in deployment; `npm run dev` supports local HTTP.

All auth POST requests require an exact matching `Origin` header, including requests from curl. Set `APP_ORIGIN` in Vercel to the public origin without a trailing slash, for example `https://your-project.vercel.app`. Without it, the request URL origin is used (local development and CI). Behind a proxy, configure the canonical public origin explicitly. No cross-origin CORS access is enabled.

The shared database limits each normalized email to 10 authentication attempts per 15 minutes. Auth bodies are limited to 4 KiB. This educational limit is not a complete abuse prevention system: public deployment also needs edge/IP controls, and an attacker could temporarily exhaust another account's attempt budget. Email verification, password recovery and MFA are future tasks. Remove expired rows periodically with `DELETE FROM sessions WHERE expires_at < now()` and `DELETE FROM auth_attempts WHERE reset_at < now()`; expiry is enforced even before cleanup.

Run `npm run test:auth` against the isolated test database after building. It checks hashing, duplicate accounts, invalid credentials, session rotation/revocation/expiry, cookie flags, rejected cross-origin requests, input limits and throttling. Tests create and remove only their own accounts.

Implementation references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Sixth backend task: ownership and roles

`/tasks` redirects anonymous visitors to `/account`. API requests are protected independently by `lib/permissions.js`; hiding UI controls is not the security boundary. Missing, expired or revoked sessions return 401. Task writes also require a matching Origin header.

Task creation assigns the signed-in user's ID on the server. Every SELECT, UPDATE and DELETE includes an owner predicate in SQL. Submitted owner IDs and roles are rejected by the strict request schemas. Requests for someone else's UUID return the same 404 as a missing task. Owners cannot transfer tasks through PATCH. Admins also see only their own tasks.

Migration `003_task_permissions.sql` preserves earlier demo rows with a NULL owner. These rows are invisible to all accounts through the API. They are not assigned to the first registered user. If you need to keep using a legacy task, deliberately assign it to a known account through trusted database administration. Deleting a user deletes that user's tasks and sessions.

New users always have role `user`. `GET /api/admin/users` demonstrates an admin-only endpoint: it returns up to 100 account IDs, emails and roles, never passwords or sessions. Ordinary users receive 403. There is no public endpoint for granting roles. From a trusted terminal connected to the intended database:

```sh
npm run user:role -- someone@example.com admin
npm run user:role -- someone@example.com user
```

Roles are loaded from PostgreSQL on every request, so changes affect existing sessions immediately. Apply migrations before deploying. Run `npm run test:permissions` to verify anonymous rejection, two-account isolation, forged ownership, cross-origin writes, legacy tasks, and role changes.

### Authenticated curl requests

The earlier CRUD examples now need a session cookie. Start with:

```sh
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your long password here"}'
curl -b cookies.txt http://localhost:3000/api/tasks
```

For POST/PATCH/DELETE add `-b cookies.txt` and `-H 'Origin: http://localhost:3000'` to the CRUD examples. Use `npm run dev` for HTTP testing; deployed production cookies require HTTPS. Keep cookie files private and out of version control.

## Seventh backend task: search and pagination

The task manager now has title search, a status filter, sorting, page-size selection and Previous/Next controls. Applying filters resets to page 1. Writes reload the current result set so renamed tasks, status changes, totals and empty last pages stay consistent with the active filters. A successful write followed by a failed refresh is reported separately, preventing accidental retries of an already-saved create.

`GET /api/tasks` accepts these optional query parameters:

| Parameter | Default | Rules |
| --- | --- | --- |
| `q` | empty | Trimmed, case-insensitive literal title substring; at most 200 characters |
| `status` | all | `todo`, `in_progress` or `done`; omit for all |
| `page` | 1 | Integer from 1 to 10000 |
| `pageSize` | 10 | Integer from 1 to 100 |
| `sort` | `oldest` | `oldest`, `newest` or `title` |

Unknown or duplicate parameters and invalid values return 400 `INVALID_QUERY`. Search treats `%`, `_`, backslashes and SQL-like input as literal text. All values are SQL parameters; sort expressions come from a fixed allowlist. Each order includes UUID as a tie-breaker. Ownership is part of the query before filtering, counting and pagination, so neither rows nor totals reveal other accounts' tasks.

Example: `/api/tasks?q=report&status=todo&page=2&pageSize=10&sort=newest`.

```json
{
  "tasks": [],
  "pagination": {
    "page": 2, "pageSize": 10, "total": 0, "totalPages": 0,
    "hasNext": false, "hasPrevious": true
  }
}
```

The count and page are read in one SQL statement. An out-of-range page returns an empty array and the actual total; the UI moves back to the last available page after deletion. The API now always returns pagination metadata and a bounded list. Clients that previously expected all tasks must request additional pages. Offset pagination is appropriate for this small learning project; large offsets cost more, and concurrent inserts/deletes between separate requests can shift page boundaries. Cursor pagination and indexed full-text search are possible later improvements.

Run `npm run test:search` after building and migrating the test database. Tests cover multiple pages, tied timestamps, sorting, empty results, literal wildcard characters, invalid query strings and two-account isolation. No new migration or environment variable is required for this step.

Reference: [PostgreSQL LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html).

## Eighth backend task: private task attachments

Open **Attachments** on a task to upload, download or delete files. Only the task owner can access them; admin roles do not bypass ownership. Deleting a task or its account removes its attachments through foreign-key cascades.

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/tasks/:id/attachments` | Metadata list; file contents are not included |
| POST | `/api/tasks/:id/attachments` | Multipart upload, exactly one `file` field; 201 and `Location` |
| GET | `/api/tasks/:id/attachments/:attachmentId` | Download after checking the current session and task owner |
| DELETE | `/api/tasks/:id/attachments/:attachmentId` | 204; requires a matching Origin |

Supported extensions are `.txt`, `.pdf`, `.png`, `.jpg` and `.jpeg`. Files must be nonempty and no larger than **1 MiB**. Extension and MIME type must match; TXT content must be valid UTF-8 without binary control characters, and PDF/PNG/JPEG signatures are checked. Names are reduced to a basename, stripped of control characters and limited to 120 characters. Unknown multipart fields and multiple files are rejected. The complete multipart body is capped at 1 MiB + 16 KiB, counted while reading even when Content-Length is absent.

Each task permits 10 files, and each account permits 20 MiB across tasks. Uploads lock the owner row within a transaction before checking quotas and inserting bytes, so concurrent uploads cannot bypass those limits. Failures return structured errors: 400 `INVALID_MULTIPART`, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE`, 422 `INVALID_FILE`, or 409 `ATTACHMENT_QUOTA`. Missing and foreign attachments both return 404. Normal session and origin errors still apply.

Run `npm run db:migrate` to apply `004_task_attachments.sql` before deployment. This learning implementation stores both metadata and bounded file bytes in PostgreSQL `bytea`. It survives application restarts and works across hosted instances without a local filesystem or another storage credential. Database space and backup size therefore grow with uploads; for larger files or a public service, migrate the storage adapter to private object storage and consider direct signed uploads.

Downloads are always served as `application/octet-stream` with `Content-Disposition: attachment`, `nosniff`, a restrictive CSP and `no-store`. There are no public file URLs or inline previews. Signature checks do not scan for malware or guarantee valid/safe PDF/image content; only download files you trust. Malware scanning is a separate future feature.

With a local development session in `cookies.txt`:

```sh
curl -b cookies.txt -X POST http://localhost:3000/api/tasks/TASK_ID/attachments \
  -H 'Origin: http://localhost:3000' -F 'file=@notes.txt;type=text/plain'
```

Run `npm run test:uploads` after building and migrating the isolated test database. It verifies type and size rejection, chunked-body limits, download headers and bytes, two-account access isolation, cross-origin rejection, persistence from another process, concurrent quota enforcement and cleanup after task deletion. Existing authentication, CRUD, search and permission suites also run in CI.

References: [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Vercel Functions limits](https://vercel.com/docs/functions/limitations).

## Ninth backend task: external API and GitHub webhooks

Open `/integrations` (linked from Tasks) to import a **public GitHub issue**. `POST /api/integrations/github/import` accepts `{ "owner": "example", "repo": "project", "issueNumber": 42 }`. It requires your session and matching Origin. Import returns 201 with `taskId`, or 200 with the same ID on a repeated import. Each account gets its own task; pull requests are rejected. The title is trimmed to 200 UTF-16 units and closed issues become `done`.

The server calls only `https://api.github.com`, without a token, with a five-second timeout, redirects disabled and a bounded response body. User-provided URLs are not accepted. Missing issues, provider throttling and invalid/upstream responses become structured errors. A persistent limit allows 20 import attempts per account per hour. GitHub's unauthenticated shared-IP limit also applies; this is a small-demo integration, not private repository access.

Apply migration `005_github_integration.sql`. Import works without additional secrets. To enable inbound updates for a repository you administer:

1. Generate a random secret of at least 32 characters, store it as server-only `GITHUB_WEBHOOK_SECRET`, and redeploy.
2. In the GitHub repository's webhook settings, configure `https://YOUR_DOMAIN/api/webhooks/github`, content type `application/json`, the same secret and **Issues** events. Keep SSL verification enabled.
3. Import an issue, then edit, close or reopen it. The signed event updates title and status on each previously imported copy. Local `in_progress` or edited titles will be replaced by the next newer issue snapshot.

The endpoint validates HMAC-SHA256 over the original bounded body with a constant-time comparison before parsing it. It does not use a browser session or Origin header: the signature authenticates the sender. Only existing GitHub mappings can be updated; payloads cannot choose an arbitrary user or task. Database receipts deduplicate delivery UUIDs in the same transaction as changes. Reusing an ID with a changed body returns 409. Older or equal `updated_at` timestamps are ignored; events sharing a timestamp are not totally ordered. Repository renames are not followed automatically. Deleting a task removes its mapping and webhooks do not recreate it.

When webhooks are disabled, the endpoint returns 503. Unsupported event types/actions return 202. Failed database transactions roll back receipts and changes together, permitting redelivery. Delivery receipts are retained; monitor their size before adding a cleanup policy because pruning weakens replay detection. Configure webhooks yourself only on repositories you administer; no repository settings are changed by this PR.

`npm run test:integrations` uses a fake GitHub HTTP provider and real PostgreSQL, plus actual HTTP webhook requests. It covers timeout/error mapping, validation, repeat imports, ownership, throttling, bad signatures, replay and stale events. CI never calls the live GitHub API or sends messages.

References: [GitHub issue API](https://docs.github.com/en/rest/issues/issues#get-an-issue), [GitHub webhook verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).

## Tenth backend task: background email jobs

Open `/notifications` from Tasks and choose **Queue summary**. The request persists a snapshot of up to 100 of your own tasks and returns immediately with 202. A separate worker handles delivery. The recipient comes from your account; the API accepts no recipient, subject or body override. Preview and job status are visible only to the owner. One new summary per account per hour is allowed.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/notifications/task-summary` | `{ "requestId": "UUID" }`; persist job, 202 (200 for a repeat) |
| GET | `/api/notifications/jobs` | Last 20 of your jobs |
| GET | `/api/notifications/jobs/:id` | Your job status and captured message |
| POST | `/api/internal/email-jobs` | Process at most 3 jobs; requires worker bearer secret |

Apply `006_email_jobs.sql`. `EMAIL_MODE=preview` is the default: jobs become `previewed` without calling an email provider. Real delivery requires explicitly setting `EMAIL_MODE=send`, `RESEND_API_KEY` and `EMAIL_FROM` (a sender verified with Resend), then restarting/redeploying both app and worker. Mode and message, including sender, are captured when enqueuing; changing settings does not turn preview jobs into real emails or change retry payloads. This learning app does not yet verify account email ownership; keep preview mode for public/untrusted signups until email verification and broader abuse controls are implemented.

### Run the worker

For local development, in a separate terminal with the same `.env.local`:

```sh
npm run worker:email             # One batch, then exit
npm run worker:email -- --watch  # Poll every five seconds until stopped
```

On Vercel, do not run a permanent background loop inside a request. Set a random 32+ character `EMAIL_WORKER_SECRET` on the app. The **Process queued emails** GitHub Actions workflow is manual-only: set repository variable `APP_ORIGIN` to the deployed HTTPS origin and repository secret `EMAIL_WORKER_SECRET` to the same value, merge the workflow into main, then select **Run workflow**. It invokes one bounded batch; it does not build or deploy the app. For unattended processing, run the CLI under a process supervisor or configure your scheduler to POST to the protected worker endpoint frequently (for example every minute). No automatic schedule is installed by this PR. Requests do not send email inline and no fire-and-forget promises are used.

### Retry and crash behavior

Workers claim one row at a time with `FOR UPDATE SKIP LOCKED`, allowing parallel workers without a shared in-memory queue. A claim has a two-minute lease and a random token. Expired leases can be reclaimed; stale workers cannot overwrite a newer claim. Provider requests time out after ten seconds. Network failures, 408/409/429 and server errors retry with exponential backoff and jitter, honoring bounded numeric Retry-After. Permanent provider errors or five attempts lead to `failed` status. Jobs older than 20 hours expire instead of retrying indefinitely; the scheduler must run often enough to process them.

Each real request uses `task-summary/JOB_ID` as the Resend idempotency key with an immutable payload. This handles the crash window between provider acceptance and the database status update within the provider's retention window. It is not an unlimited exactly-once guarantee. `sent` means the provider accepted the message, not that it reached the inbox. A crash after the final accepted attempt may leave a failed/uncertain job; inspect provider delivery logs before requesting another message. Completed/failed payloads remain in PostgreSQL until the account is deleted or an operator applies a deliberate retention policy; deleting a job also removes its request deduplication record.

CLI output and worker API responses contain aggregate counts only; errors stored on jobs are safe codes, not provider bodies, addresses, message content or credentials. Account deletion cascades queued jobs; a message already in flight cannot be recalled.

`npm run test:email` exercises real PostgreSQL and HTTP endpoints, plus a separate worker process. It verifies deduplication, owner isolation, throttling, worker authorization, concurrent claims, expired-lease recovery, retries/exhaustion, message previews and stable provider keys. The provider is faked; CI and the development preview mode send no emails.

References: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Verify the production server

Tests require a **separate, initially empty** database, with a name ending in `_test`. They use `TEST_DATABASE_URL`, never the development `DATABASE_URL`. Create the local test database once:

```sh
docker compose exec db createdb -U playground playground_test
```

With the sample test URL from `.env.example`:

```sh
DATABASE_URL=postgresql://playground:playground@localhost:5432/playground_test npm run db:migrate
npm run build
npm run test:api
npm run test:db
```

The persistence check reads a task from a new Node.js process and verifies concurrent partial updates. Tests delete the records they create on success; a failed HTTP test may leave fixtures, so use a disposable test database. They never truncate a database.

The check starts and stops its own production server on an OS-assigned local port. It verifies health behavior plus the complete task lifecycle across collection and detail routes, partial updates, invalid writes, missing records, and deletion isolation. `npm run test:health` remains available for the health-only check.

## GitHub Actions

`.github/workflows/server.yml` builds and tests pull requests, pushes to `main`, and manual runs. Production deployment always requires `main` and successful checks.

- **Automatic:** pushes to `main` deploy only when the repository variable `VERCEL_DEPLOY_ENABLED` equals `true`.
- **Manual:** open [Actions → Build, test, and deploy Next.js](https://github.com/yura888840/nextjs-playground/actions/workflows/server.yml), click **Run workflow**, select **main**, leave **Deploy to production (main branch only)** checked, and click **Run workflow** again. This does not require `VERCEL_DEPLOY_ENABLED`.
- Uncheck the deployment option to run only the build and API checks. Manual runs on other branches also run checks only.

The updated workflow must be merged into `main` before the new input appears. Manual deployment still requires all three Vercel secrets and any configured approval for the `production` environment.

PR checks require no secrets. The deployment job uses Vercel's production build configuration and deploys the resulting prebuilt artifact. `vercel.json` disables native Git-triggered Vercel deployments to avoid bypassing the Actions checks.

## One-time Vercel setup

Vercel Hobby is free within its limits for personal, non-commercial projects. API handlers run as Vercel Functions, not as a permanently running VPS process.

1. Create a Vercel Hobby account and a project for this repository. Use the Next.js preset, repository root, Node.js 22.x, and the default Next.js output directory (not `out`).
2. Link the local checkout to that project:

   ```sh
   npx vercel@59.23.1 login
   npx vercel@59.23.1 link
   ```

3. Create a Vercel access token. In GitHub **Settings → Secrets and variables → Actions**, add repository secrets:
   - `VERCEL_TOKEN`: your Vercel access token.
   - `VERCEL_ORG_ID`: `orgId` from the generated `.vercel/project.json`.
   - `VERCEL_PROJECT_ID`: `projectId` from that file.
4. Optional: add the repository **variable** `VERCEL_DEPLOY_ENABLED` with value `true` to enable automatic deployment after pushes to `main`. Leave it unset or `false` for manual-only deployment.
5. Merge this PR and inspect the Actions run, or run **Build, test, and deploy Next.js** manually on `main` if already merged.
6. Open the production domain shown by Vercel and check `/api/health` twice to confirm fresh timestamps. Live hosting is not verified by the local test.

Keep tokens in GitHub Secrets; do not commit them. `.vercel/` is ignored. Local Docker uses the development credentials in `.env.example`. Configure `DATABASE_URL` and apply migrations before deploying the task manager.

## Migration from GitHub Pages

The Pages workflow and static export configuration have been replaced because GitHub Pages cannot execute this API. The app now serves from `/`, without `/nextjs-playground`. Existing Pages content may remain online as an old snapshot, but receives no new deployments. Once Vercel is verified, unpublish the old Pages site in repository settings if desired.

Automatic deployment stays disabled unless explicitly enabled. Manual deployment checks the required secrets and fails with a clear error if any are missing. This repository configuration alone does not create a Vercel account or publish a live server.

## Files

- `app/page.js`: counter page with a link to the task manager.
- `app/tasks/page.js`: server-side session guard.
- `app/tasks/task-manager.js`: client-side CRUD interface.
- `app/tasks/tasks.module.css`: responsive task manager styles.
- `app/layout.js`: English metadata and document language.
- `app/api/health/route.js`: server endpoint.
- `app/api/tasks/route.js`: task collection handlers.
- `app/api/tasks/[id]/route.js`: individual task handlers.
- `lib/task-store.js`: asynchronous PostgreSQL task store.
- `lib/db.js`: reusable server-side database pool.
- `lib/task-handler.js`: database error responses.
- `migrations/`: versioned SQL schema changes.
- `scripts/migrate.mjs`: transactional migration runner.
- `compose.yaml`: local PostgreSQL service.
- `lib/task-http.js`: JSON responses and basic input checks.
- `scripts/check-health.mjs`: production server runner and health checks.
- `scripts/check-tasks.mjs`: task API HTTP checks.
- `.github/workflows/server.yml`: CI and optional production deployment.

References: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Vercel with GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
