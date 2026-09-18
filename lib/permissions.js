import { checkOrigin, currentUser, readSessionToken } from './auth.js';
import { error } from './task-http.js';
import { taskHandler } from './task-handler.js';

export function authenticated(handler, role) {
  return taskHandler(async (request, context) => {
    const user = await currentUser(readSessionToken(request));
    if (!user) return error('Sign in to continue.', 401, 'UNAUTHENTICATED');
    if (role && user.role !== role) return error('You do not have permission for this action.', 403, 'FORBIDDEN');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const rejected = checkOrigin(request);
      if (rejected) return rejected;
    }
    return handler(request, context, user);
  });
}
