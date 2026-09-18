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

`.github/workflows/server.yml` builds and tests pull requests and pushes to `main`. Deployment runs only on `main`, after successful checks, when the repository variable `VERCEL_DEPLOY_ENABLED` equals `true`. Manual runs are also available on `main`.

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
4. Add the repository **variable** `VERCEL_DEPLOY_ENABLED` with value `true`.
5. Merge this PR and inspect the Actions run, or run **Build, test, and deploy Next.js** manually on `main` if already merged.
6. Open the production domain shown by Vercel and check `/api/health` twice to confirm fresh timestamps. Live hosting is not verified by the local test.

Keep tokens in GitHub Secrets; do not commit them. `.vercel/` is ignored. No secrets are needed to run the application locally.

## Migration from GitHub Pages

The Pages workflow and static export configuration have been replaced because GitHub Pages cannot execute this API. The app now serves from `/`, without `/nextjs-playground`. Existing Pages content may remain online as an old snapshot, but receives no new deployments. Once Vercel is verified, unpublish the old Pages site in repository settings if desired.

The deployment job stays disabled until setup is complete, so builds and API checks can run immediately. This PR alone does not create a Vercel account or publish a live server.

## Files

- `app/page.js`: interactive counter page.
- `app/layout.js`: English metadata and document language.
- `app/api/health/route.js`: server endpoint.
- `scripts/check-health.mjs`: production HTTP check.
- `.github/workflows/server.yml`: CI and optional production deployment.

References: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Vercel with GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
