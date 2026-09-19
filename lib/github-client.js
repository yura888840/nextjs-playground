import { githubIssueSchema } from './github-schema.js';
import { readBytes } from './bounded-body.js';
export class GithubError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
// Injectable fetch is only for unit tests. The production target is never configurable by a request.
export async function fetchGithubIssue({ owner, repo, issueNumber }, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nextjs-playground' },
      signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
    });
  } catch { throw new GithubError('GITHUB_UNAVAILABLE', 502); }
  if (response.status === 404) throw new GithubError('GITHUB_NOT_FOUND', 404);
  if ([403,429].includes(response.status)) throw new GithubError('GITHUB_RATE_LIMITED', 503);
  if (!response.ok) throw new GithubError('GITHUB_UNAVAILABLE', 502);
  let result;
  try { result = githubIssueSchema.safeParse(JSON.parse((await readBytes(response.body, 1024 * 1024)).toString('utf8'))); }
  catch { throw new GithubError('GITHUB_INVALID_RESPONSE', 502); }
  if (!result.success || result.data.number !== issueNumber) throw new GithubError('GITHUB_INVALID_RESPONSE', 502);
  if (result.data.pull_request) throw new GithubError('GITHUB_NOT_AN_ISSUE', 422);
  return result.data;
}
