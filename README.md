# nextjs-playground

A learning project built with Next.js App Router, React, and JavaScript: a single page with an interactive counter and responsive styles.

## Requirements

Node.js 22+ and npm.

## Local development

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The counter runs in your browser and resets when you reload the page.

## Production build

```sh
npm run build
```

`next.config.mjs` sets `output: 'export'`. The generated site is in `out/`: deploy the contents of this directory to a static host. Node.js is required for development and builds; the deployed version has no running Node.js server, API, or database.

To preview the static build locally, if Python is installed:

```sh
python3 -m http.server 3000 --directory out
```

## Project structure

- `app/page.js` — page and client-side counter.
- `app/layout.js` — shared layout and metadata.
- `app/globals.css` — responsive styles.
- `app/icon.svg` — application icon.
- `next.config.mjs` — static export configuration.

## Next step: server mode

To use APIs and other server features, remove `output: 'export'` from `next.config.mjs`, then run `npm run build` and `npm start` on a host that supports Node.js. `npm start` is not used in the current static export mode.

## Automatic deployment: GitHub Pages

The `.github/workflows/deploy-pages.yml` workflow checks builds in pull requests and publishes `out/` after a push or merge to `main`. You can also run it manually: **Actions → Build and deploy to GitHub Pages → Run workflow** (select `main`). Pull requests and other branches do not deploy.

### One-time setup before the first deployment

1. Open [Settings → Pages](https://github.com/yura888840/nextjs-playground/settings/pages).
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Merge the workflow PR into `main`. If it is already merged, run the workflow manually.
4. Wait for the `deploy` job to succeed in the Actions tab.

After a successful deployment, the site will be available at:
https://yura888840.github.io/nextjs-playground/

GitHub Pages is free for this public repository. No separate hosting account or user-managed secrets are needed: the workflow uses the built-in `GITHUB_TOKEN` and OIDC. The site will be public.

The workflow sets `NEXT_PUBLIC_BASE_PATH=/nextjs-playground` so JavaScript, CSS, and links work correctly under the GitHub Pages subpath. Local `npm run dev` still serves the app at the root of `http://localhost:3000`. If you rename the repository, update the path in the workflow; for a custom domain serving the app at its root, remove this variable.

GitHub Pages serves static files only and does not run Node.js, SSR, or server APIs. Switching to server mode requires a different host and workflow.

Documentation: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Next.js basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath).
