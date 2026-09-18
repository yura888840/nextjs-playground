import { currentUser, readSessionToken } from '../../../../lib/auth.js';
import { taskHandler } from '../../../../lib/task-handler.js';
import { json, error } from '../../../../lib/task-http.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = taskHandler(async request => {
  const user = await currentUser(readSessionToken(request));
  return user ? json({ user }) : error('Sign in to continue.', 401, 'UNAUTHENTICATED');
});
