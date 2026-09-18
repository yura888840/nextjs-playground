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

Tasks now persist in PostgreSQL (task 4) and are shared across application instances. The API has no authentication or user isolation yet: anyone with access can read and modify all tasks. Use test data only.

| Method | Endpoint | Success |
| --- | --- | --- |
| GET | `/api/tasks` | 200 with `{ "tasks": [...] }` |
| POST | `/api/tasks` | 201 with the new task and a `Location` header |
| GET | `/api/tasks/:id` | 200 with one task |
| PATCH | `/api/tasks/:id` | 200 with the updated task |
| DELETE | `/api/tasks/:id` | 204 with an empty body |

A task has `id` (server-generated UUID), `title`, `status`, `createdAt`, and `updatedAt` (UTC timestamps). Status is `todo` by default, with `in_progress` and `done` also supported. List order is creation time, then UUID; filtering and pagination are separate exercises.

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
- `app/tasks/page.js`: client-side CRUD interface.
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
