# nextjs-playground

A Next.js App Router learning project with a React counter and a Node.js health endpoint. All application copy is in English.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
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

## Verify the production server

```sh
npm run build
npm run test:health
```

The check starts and stops its own production server on an OS-assigned local port. It verifies the homepage, HTTP status, JSON, response cache policy, fresh server timestamps, and rejection of POST requests.

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

Keep tokens in GitHub Secrets; do not commit them. `.vercel/` is ignored. No secrets are needed to run the application locally.

## Migration from GitHub Pages

The Pages workflow and static export configuration have been replaced because GitHub Pages cannot execute this API. The app now serves from `/`, without `/nextjs-playground`. Existing Pages content may remain online as an old snapshot, but receives no new deployments. Once Vercel is verified, unpublish the old Pages site in repository settings if desired.

Automatic deployment stays disabled unless explicitly enabled. Manual deployment checks the required secrets and fails with a clear error if any are missing. This repository configuration alone does not create a Vercel account or publish a live server.

## Files

- `app/page.js`: interactive counter page.
- `app/layout.js`: English metadata and document language.
- `app/api/health/route.js`: server endpoint.
- `scripts/check-health.mjs`: production HTTP check.
- `.github/workflows/server.yml`: CI and optional production deployment.

References: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Vercel with GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
