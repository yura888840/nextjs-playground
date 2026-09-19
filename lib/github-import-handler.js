import { authenticated } from './permissions.js';
import { githubImportSchema } from './github-schema.js';
import { fetchGithubIssue, GithubError } from './github-client.js';
import { allowGithubImport, importGithubIssue } from './github-store.js';
import { BodyTooLarge, readBytes } from './bounded-body.js';
import { json, error } from './task-http.js';
import { validationDetails } from './task-schema.js';
export function githubImportHandler(fetcher = fetch) {
  return authenticated(async (request, _context, user) => {
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return error('Use application/json.',415,'UNSUPPORTED_MEDIA_TYPE');
    let body;
    try { body=JSON.parse((await readBytes(request.body,4096)).toString('utf8')); }
    catch(err) { return error('Invalid import request.',err instanceof BodyTooLarge?413:400,err instanceof BodyTooLarge?'BODY_TOO_LARGE':'INVALID_JSON'); }
    const parsed=githubImportSchema.safeParse(body);
    if(!parsed.success) return error('Check the repository and issue number.',422,'VALIDATION_ERROR',validationDetails(parsed.error));
    if(!(await allowGithubImport(user.id))) return error('Too many imports. Try again in one hour.',429,'RATE_LIMITED',{}, {'Retry-After':'3600'});
    let issue;
    try { issue=await fetchGithubIssue(parsed.data,fetcher); }
    catch(err) { if(!(err instanceof GithubError)) throw err; return error('GitHub issue could not be imported. Check the public repository and try again later.',err.status,err.code); }
    const repository=`${parsed.data.owner}/${parsed.data.repo}`.toLowerCase();
    const result=await importGithubIssue(user.id,repository,issue);
    return json({...result,sourceUrl:`https://github.com/${repository}/issues/${issue.number}`},result.created?201:200);
  });
}
