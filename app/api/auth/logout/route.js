import { checkOrigin, cookieHeader, readSessionToken, revokeSession } from '../../../../lib/auth.js';
import { taskHandler } from '../../../../lib/task-handler.js';
import { noStore } from '../../../../lib/task-http.js';
export const runtime = 'nodejs';
export const POST = taskHandler(async request => {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  await revokeSession(readSessionToken(request));
  return new Response(null, { status: 204, headers: { ...noStore, 'Set-Cookie': cookieHeader('', true) } });
});
